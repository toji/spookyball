import { System, Tag } from './engine/core/ecs.js';
import { Transform } from './engine/core/transform.js';
import { SphereGeometry } from './engine/geometry/sphere.js';
import { PBRMaterial } from './engine/core/materials.js';
import { Mesh } from './engine/core/mesh.js';
import { PointLight } from './engine/core/light.js';

import { Physics2DBody } from './physics-2d.js';
import { Paddle, GameState } from './player.js';

import { vec3 } from 'gl-matrix';
import { Collisions, ImpactDamage } from './impact-damage.js';

export class Ball {
  waitingForLaunch = true;
  speed = 0.5;
}

export class BonusBall {
  // Anything go here?
}

export class BallSystem extends System {
  executesWhenPaused = false;

  init(gpu, gltfLoader) {
    this.ballQuery = this.query(Ball, Physics2DBody, Transform);
    this.paddleQuery = this.query(Paddle);

    this.bonusQuery = this.query(Transform, BonusBall, Tag('dead'));

    gltfLoader.fromUrl('./media/models/ball-compressed.glb').then(scene => {
      // The materials for the ball need some special tweaking to look right.
      for (const material of scene.materials) {
        // The ball shouldn't cast a shadow, because it's glowy.
        material.castsShadow = false;

        // The materials of the ball should be additive to avoid blending issues and glow more.
        material.additiveBlend = true;

        // Don't write to the depth, or sorting will kill us.
        material.depthWrite = false;
      }
      this.ballScene = scene;
    });
  }

  execute(delta, time, gpu) {
    const gameState = this.singleton.get(GameState);

    let ballCount = 0;
    let lostBall = false;
    let paddleState;
    let waitingBallCount = 0;

    this.paddleQuery.forEach((entity, paddle) => {
      paddleState = paddle;
      return false; // Only get one paddle
    });

    this.ballQuery.forEach((entity, ball, body, transform) => {
      if (ball.waitingForLaunch && paddleState) {
        Matter.Body.setPosition(body.body, {
          x: paddleState.x,
          y: 23
        });

        if (paddleState.launch) {
          // Launch the ball in a semi-random direction, but always primarily up
          const direction = vec3.fromValues((Math.random() * 2.0 - 1.0) * 0.5, 0, -1.5);
          this.launchBall(ball, body, direction);
        } else {
          waitingBallCount++;
        }
      }

      // Has the ball collided with anything?
      /*const collisions = entity.get(Collisions);
      if (collisions) {
        for (const collider of collisions.entities) {
          // If we collided with a paddle give the ball's velocity a little bump.
          if (collider.get(Paddle)) {
            Matter.Body.setVelocity(body.body, {
              x: body.body.velocity.x * 1.2,
              y: body.body.velocity.y * 1.2,
            });
          }
        }
      }*/

      // This is an abuse of the physics system, but it has a tencency to slow the ball down after
      // collisions even though the restitution is 1. So we'll just check and see if the ball is
      // moving slower than the constant speed we want and, if so, scale the velocity to the
      // appropriate speed.
      const speed = Math.sqrt((body.body.velocity.x * body.body.velocity.x) +
        (body.body.velocity.y * body.body.velocity.y));
      if (speed != 0 && speed < ball.speed) {
        const scaleFactor = ball.speed / speed;
        Matter.Body.setVelocity(body.body, {
          x: body.body.velocity.x * scaleFactor,
          y: body.body.velocity.y * scaleFactor,
        });
      }

      // If a ball gets past a player, destroy the ball.
      if (transform.position[2] > 30) {
        entity.add(Tag('dead'));
        lostBall = true;
      } else {
        ballCount++;
      }
    });

    this.bonusQuery.forEach((entity, transform) => {
      // Launch the bonus ball in a random direction
      const direction = vec3.fromValues((Math.random() * 2.0 - 1.0), 0, -(Math.random() * 2.0 - 1.0));
      this.spawnBall([transform.position[0], 1, transform.position[1]], direction);
    });

    // If there are no balls currently in play, spawn a new one.
    if (ballCount == 0) {
      // If there are no balls left and we've lost a ball this frame, subtract one of the player's
      // lives.
      if (lostBall) {
        gameState.lives--;
      }
      if (!gameState.levelStarting && gameState.lives > 0) {
        this.spawnBall([paddleState.x, 1, 23]);
      }
    }

    if (gpu.flags.lucasMode && waitingBallCount == 0 && paddleState) {
      this.spawnBall([paddleState.x, 1, 23]);
    }
  }

  spawnBall(position, velocity = null) {
    if (!this.ballScene) {
      return;
    }

    const gameState = this.singleton.get(GameState);

    //const ball = this.world.create(this.ballMesh, new Transform());

    const ball = this.ballScene.createInstance(this.world);
    ball.add(this.ballScene.animations['Take 001']);

    const transform = ball.get(Transform);
    transform.position = position;

    const body = new Physics2DBody('circle', transform.position[0], transform.position[2], 0.8,
      { friction: 0, restitution: 1, frictionAir: 0 });

    const ballState = new Ball();
    ballState.speed = 0.5 + gameState.level * 0.03;
    if (velocity) {
      this.launchBall(ballState, body, velocity);
    }
    
    ball.add(
      ballState,
      transform,
      body,
      new PointLight({ color: [0.5, 1, 1], intensity: 10, range: 10 }),
      new ImpactDamage(1),
    );

    ball.name = 'The Ball';

    return ball;
  }

  launchBall(ball, body, direction) {
    vec3.normalize(direction, direction);
    vec3.scale(direction, direction, ball.speed);
    Matter.Body.setVelocity(body.body, {
      x: direction[0],
      y: direction[2],
    });
    ball.waitingForLaunch = false;
  }
}