import { System, Tag } from './engine/core/ecs.js';
import { KeyboardState, GamepadState } from './engine/core/input.js';
import { Physics2DBody } from './physics-2d.js';
import { FlyingControls } from './engine/controls/flying-controls.js';

const PADDLE_SPEED = 62;

export class GameState {
  level = 0;
  levelStarting = true;
  score = 0;
  lives = 3;
};

export class Paddle {
  constructor() {
    this.x = 0;
    this.launch = false;
  }
}

export class PlayerSystem extends System {
  executesWhenPaused = false;

  init(gpu, gltfLoader) {
    this.paddleQuery = this.query(Paddle, Physics2DBody);
    this.flyingControlsQuery = this.query(FlyingControls);

    // Give the paddle a shape that tilts slightly at the corners. That way, players can control the direction of the
    // ball a little better if they're skilled.
    const paddleBodyVertices = [[
      { x: -4, y: -0.2 }, { x: -2, y: -.5 }, { x: 2, y: -.5 }, { x: 4, y: -0.2 },
      { x: 4, y: 1 }, { x: -4, y: 1 },
    ]]
    const body = new Physics2DBody('fromVertices', 0, 25, paddleBodyVertices, { isStatic: true, friction: 0, restitution: 1 });

    gltfLoader.fromUrl('./media/models/paddle-compressed.glb').then(scene => {
      const paddle = scene.createInstance(this.world);
      //paddle.add(scene.animations['ms02_05_Idle']);
      paddle.add(
        new Paddle(),
        body
      );
      paddle.name = 'Player Paddle';
    });
  }

  execute(delta, time) {
    const useWASD = this.flyingControlsQuery.getCount() == 0;

    const gamepad = this.singleton.get(GamepadState);
    const keyboard = this.singleton.get(KeyboardState);
    //const mouse = this.singleton.get(MouseState);

    let movement = 0;
    let launch = false;

    // Keyboard input
    if (keyboard.keyPressed('ArrowRight')) {
      movement += 1.0;
    }
    if (keyboard.keyPressed('ArrowLeft')) {
      movement -= 1.0;
    }
    if (keyboard.keyPressed('ArrowUp')) {
      launch = true;
    }

    // An alternate set of keybindings to use, but only if flying controls aren't enabled.
    if (useWASD) {
      if (keyboard.keyPressed('KeyD')) {
        movement += 1.0;
      }
      if (keyboard.keyPressed('KeyA')) {
        movement -= 1.0;
      }
      if (keyboard.keyPressed('KeyW') || keyboard.keyPressed('Space')) {
        launch = true;
      }
    }

    // Gamepad input
    for (const pad of gamepad.gamepads) {
      // Left Stick
      if (pad.axes.length > 1) {
        // Account for a deadzone
        movement += Math.abs(pad.axes[0]) > 0.1 ? pad.axes[0] : 0;
      }

      if (pad.buttons.length && pad.buttons[0].pressed) {
        launch = true;
      }

      // Dpad
      if (pad.buttons.length > 15) {
        if (pad.buttons[14].pressed) {
          movement -= 1.0;
        }
        if (pad.buttons[15].pressed) {
          movement += 1.0;
        }
      }
    }

    // Ensure we can never move too fast.
    movement = Math.min(1, Math.max(-1, movement)) * delta * PADDLE_SPEED;

    this.paddleQuery.forEach((entity, paddle, body) => {
      paddle.x += movement;

      // Constrain movement to the board
      paddle.x = Math.min(17, Math.max(-17, paddle.x));

      paddle.launch = launch;

      // Update the physics body
      Matter.Body.setPosition(body.body, { x: paddle.x, y: body.body.position.y });
    });
  }
}
