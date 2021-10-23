import { System } from './engine/core/ecs.js';
import { Transform } from './engine/core/transform.js';
import { AnimationTiming } from './engine/core/animation.js';
import { Physics2DBody } from './physics-2d.js';
import { Health } from './lifetime.js';
import { Ball, BonusBall } from './ball.js';
import { GameState } from './player.js';

import { quat } from 'gl-matrix';
import { Points } from './score.js';

const tmpQuat = quat.create();

export class Block {
  constructor(x, y, buried = -5) {
    this.x = x;
    this.y = y;
    this.buried = buried;
  }
}

export class StageSystem extends System {
  enabled = false;

  init(gpu, gltfLoader) {
    this.blockQuery = this.query(Block, Transform);
    this.ballQuery = this.query(Ball);

    // construct the arena bounds
    this.world.create(new Physics2DBody('rectangle', 0, -25, 42, 2, { isStatic: true, friction: 0, restitution: 1 }));
    this.world.create(new Physics2DBody('rectangle', -22, 0, 2, 50, { isStatic: true, friction: 0, restitution: 1 }));
    this.world.create(new Physics2DBody('rectangle', 22, 0, 2, 50, { isStatic: true, friction: 0, restitution: 1 }));

    // Load a scene
    this.blockMeshes = [];
    this.bonusBlockMesh = null;
    gltfLoader.fromUrl('./media/models/graveyard-compressed.glb').then(scene => {
      // Create an instance of the graveyard scene
      const graveyard = scene.createInstance(this.world);

      // Grab the headstone meshes that will act as our blocks.
      this.blockMeshes.push(scene.getMeshByName('Headstone0'));
      this.blockMeshes.push(scene.getMeshByName('Headstone1'));
      this.blockMeshes.push(scene.getMeshByName('Headstone2'));
      this.blockMeshes.push(scene.getMeshByName('Headstone4'));
      this.blockMeshes.push(scene.getMeshByName('Headstone5'));
      this.blockMeshes.push(scene.getMeshByName('Headstone6'));

      this.bonusBlockMesh = scene.getMeshByName('HeadstoneBonus');

      // Only enable the system's execute method once the loading is done.
      this.enabled = true;
    });

    gltfLoader.fromUrl('./media/models/crow-compressed.glb').then(scene => {
      let crow = scene.createInstance(this.world);
      let transform = crow.get(Transform);
      transform.position[0] = 20.7;
      transform.position[1] = 4.1;
      transform.position[2] = -7.4;
      quat.rotateY(transform.orientation, transform.orientation, -0.7);
      crow.add(scene.animations['Idle_short']);
      crow.add(new AnimationTiming({ startTime: 0 }));

      crow = scene.createInstance(this.world);
      transform = crow.get(Transform);
      transform.position[0] = -3.8;
      transform.position[1] = 8.5;
      transform.position[2] = -24;
      quat.rotateY(transform.orientation, transform.orientation, 0.3);
      crow.add(scene.animations['Idle_short']);
      crow.add(new AnimationTiming({ startTime: 5 }));
    });
  }

  execute(delta, time) {
    const gameState = this.singleton.get(GameState);

    let blockCount = 0;
    let buriedCount = 0;

    this.blockQuery.forEach((entity, block, transform) => {
      if (block.buried < 0) {
        // TODO: Dust particles would be nice
        block.buried += delta * 2.5;

        // Make it shake a bit as it comes up.
        transform.position[0] = block.x + (Math.random() * 0.4 - 0.2);
        // Slight offset to account for the fact that the ground is not at Y=0;
        transform.position[1] = block.buried - 0.6;
        transform.position[2] = block.y + (Math.random() * 0.2 - 0.1);

        // Only add the physics body once the block has fully risen.
        if (block.buried >= 0) {
          entity.add(
            new Physics2DBody('rectangle', block.x, block.y, 3, 2, {
              isStatic: true, friction: 0, restitution: 1
            })
          );
        } else {
          buriedCount++;
        }
      }
      blockCount++;
    });

    // Only allow the ball to spawing when there are no more buried blocks.
    if (!buriedCount) {
      gameState.levelStarting = false;
    }

    if (blockCount === 0 || gameState.level === 0) {
      let ballCount = this.ballQuery.getCount();
      this.startLevel(++gameState.level);

      // If you end a level with more than one ball in play, they become extra lives.
      if (ballCount > 1 && gameState.level !== 0) {
        gameState.lives += (ballCount-1);
      }
    }
  }

  startLevel(level) {
    this.singleton.get(GameState).levelStarting = true;

    // Destroy all the balls
    this.ballQuery.forEach((entity, ball) => {
      entity.destroy();
    });
    
    // Make sure we've cleared any existing blocks. (Should have happened before this function was
    // called, this is just a safety measure.)
    this.blockQuery.forEach((entity) => {
      entity.destroy();
    });

    // TODO: Display which level is about to start, then, after a quick timeout:
    switch((level-1) % 4) {
      case 0:
        this.spawnGridLevel(2, 10); break;
      case 1:
        this.spawnGridLevel(3, 10); break;
      case 2:
        this.spawnGridLevel(3, 12); break;
      case 3:
        this.spawnGridLevel(4, 12); break;
    }
  }

  spawnGridLevel(rows, columns) {
    const firstColumn = (12 - columns) / 2;

    // One extra ball per stage
    const extraBallRow = Math.floor(Math.random() * (rows - 1)) + 2;
    const extraBallColumn = Math.floor(Math.random() * columns) + firstColumn;

    for (let row = 4 - rows; row < 4; ++row) {
      const y = (row * -4.5) - 2.5;

      for (let column = firstColumn; column < columns+firstColumn; ++column) {
        let blockMesh = this.blockMeshes[Math.floor(Math.random() * this.blockMeshes.length)];

        let isBonus = column == extraBallColumn && row == extraBallRow;
        if (isBonus) {
          blockMesh = this.bonusBlockMesh;
        }

        const x = (column * 3.5) - 19.25;
        const tilt = (Math.random() * 0.3) - 0.15;
        quat.identity(tmpQuat);
        quat.rotateY(tmpQuat, tmpQuat, tilt);
        
        const buriedAmount = Math.random() * -1.5 - 5;
        const block = this.world.create(
          blockMesh,
          new Block(x, y, buriedAmount),
          new Transform({ position: [x, buriedAmount, y], orientation: tmpQuat }),
          new Points(100),
          new Health(isBonus ? 2 : 1),
        );

        if (isBonus) {
          block.add(new BonusBall());
          // Add some bonus logic.
        }
      }
    }
  }
}