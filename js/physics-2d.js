import { System, Tag } from './engine/core/ecs.js';
import { Transform } from './engine/core/transform.js';
import { Stage } from './engine/core/stage.js';

import { vec3, quat } from 'gl-matrix';
import { Collisions } from './impact-damage.js';
import { BoundingVolumeType } from './engine/core/bounding-volume.js';

const IDENTITY_QUAT = quat.create();

const bodyEntityMap = new WeakMap();

export class Physics2DBody {
  world = null;

  constructor(type, ...args) {
    this.body = Matter.Bodies[type](...args);
    this.type = type;
    if (type == 'circle') {
      this.radius = args[2]
    } else if (type == 'rectangle') {
      this.width = args[2];
      this.height = args[3];
    }
  }

  addedToEntity(entity) {
    let entities = bodyEntityMap.get(this.body);
    if (!entities) {
      entities = [entity];
      bodyEntityMap.set(this.body, entities);
    }
  }

  removedFromEntity(entity) {
    let entities = bodyEntityMap.get(this.body);
    if (entities) {
      const index = entities.indexOf(entity);
      if (index > -1) {
        entities.splice(index, 1);
      }
    }

    if (!entities?.length) {
      Matter.Composite.remove(this.world, this.body);
    }
  }
}

class Physics2DClearCollisionsSystem extends System {
  stage = Stage.PreFrameLogic - 0.1; // Should happen just before the physics update

  init() {
    this.collisionsQuery = this.query(Collisions);
  }

  execute() {
    // Clear all the collisions from previous frames.
    this.collisionsQuery.forEach((entity) => {
      entity.remove(Collisions);
    });
  }
}

export class Physics2DSystem extends System {
  stage = Stage.PreFrameLogic;
  executesWhenPaused = false;
  fixedStep = 0.0166666;

  init() {
    this.world.registerSystem(Physics2DClearCollisionsSystem)

    this.engine = Matter.Engine.create({ gravity: { scale: 1, x: 0, y: 0 } });
    // Prevent objects from coming to a rest if they collide
    Matter.Resolver._restingThresh = 0.001;

    this.bodyQuery = this.query(Physics2DBody);

    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const entitiesA = bodyEntityMap.get(pair.bodyA);
        if (!entitiesA?.length) { return; }
        const entitiesB = bodyEntityMap.get(pair.bodyB);
        if (!entitiesB?.length) { return; }

        for (const a of entitiesA) {
          let collisionsA = a.get(Collisions);
          if (!collisionsA) {
            collisionsA = new Collisions();
            a.add(collisionsA);
          }

          for (const b of entitiesB) {
            let collisionsB = b.get(Collisions);
            if (!collisionsB) {
              collisionsB = new Collisions();
              b.add(collisionsB);
            }

            collisionsA.entities.add(b);
            collisionsB.entities.add(a);
          }
        }
      }
    });
  }

  execute(delta, time) {
    // Tick the physics engine
    Matter.Engine.update(this.engine, delta);

    // Update the transforms for each entity with an associated physics object.
    this.bodyQuery.forEach((entity, body) => {
      // Add the physics body to the physics world if it isn't already.
      if (!body.world) {
        Matter.Composite.add(this.engine.world, body.body);
        body.world = this.engine.world;
      }

      // Sync up the object transform with the physics body
      let transform = entity.get(Transform);
      if (!transform) {
        transform = new Transform();
        entity.add(transform);
      }
      vec3.set(transform.position, body.body.position.x, transform.position[1], body.body.position.y);
      if (!body.body.isStatic) {
        quat.rotateZ(transform.orientation, IDENTITY_QUAT, body.body.angle);
      }
    });
  }
}
