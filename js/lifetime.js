import { System, Tag } from './engine/core/ecs.js';
import { Stage } from './engine/core/stage.js';

const DEAD_TAG = Tag('dead');

export class Lifetime {
  constructor(value = 1) {
    this.lifetime = value;
  }
}

export class Health {
  constructor(value = 1) {
    this.health = value;
  }
}

export class LifetimeHealthSystem extends System {
  init() {
    this.lifetimeQuery = this.query(Lifetime);
    this.healthQuery = this.query(Health);
  }

  execute(delta) {
    this.lifetimeQuery.forEach((entity, lifetime) => {
      lifetime.lifetime -= delta;
      if (lifetime.lifetime <= 0) {
        entity.add(DEAD_TAG);
      }
    });

    this.healthQuery.forEach((entity, health) => {
      if (health.health <= 0) {
        entity.add(DEAD_TAG);
      }
    });
  }
}

// Remove any entities tagged as 'dead' at the very end of the frame.
export class DeadSystem extends System {
  stage = Stage.Last;

  init() {
    this.deadQuery = this.query(DEAD_TAG);
  }

  execute() {
    this.deadQuery.forEach((entity) => {
      entity.destroy();
    });
  }
}