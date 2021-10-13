import { System } from './ecs.js';
import { Stage } from './stage.js';
import { vec2 } from 'gl-matrix';

export class KeyboardState {
  pressed = {};

  keyPressed(keycode) {
    return !!this.pressed[keycode];
  }
}

export class MouseState {
  buttons = [];
  position = vec2.create();
  delta = vec2.create();
  wheelDelta = vec2.create();
}

export class GamepadState {
  gamepads = [];
}

export class InputSystem extends System {
  stage = Stage.First;
  eventCanvas = null;
  lastMouseX = 0;
  lastMouseY = 0;
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  mouseWheelDeltaX = 0;
  mouseWheelDeltaY = 0;

  init() {
    const keyboard = new KeyboardState();
    const mouse = new MouseState();
    const gamepad = new GamepadState();

    this.singleton.add(keyboard, mouse, gamepad);

    window.addEventListener('keydown', (event) => {
      // Do nothing if event already handled
      if (event.defaultPrevented) { return; }
      keyboard.pressed[event.code] = true;
    });
    window.addEventListener('keyup', (event) => {
      keyboard.pressed[event.code] = false;
    });
    window.addEventListener('blur', (event) => {
      // Clear the pressed keys on blur so that we don't have inadvertent inputs
      // after we've shifted focus to another window.
      keyboard.pressed = {};
      mouse.buttons = [];
    });

    this.pointerEnterCallback = (event) => {
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    };

    this.pointerMoveCallback = (event) => {
      this.mouseDeltaX += event.clientX - this.lastMouseX;
      this.mouseDeltaY += event.clientY - this.lastMouseY;
      this.lastMouseX = mouse.position[0] = event.clientX;
      this.lastMouseY = mouse.position[1] = event.clientY;
    };

    this.pointerDownCallback = (event) => {
      mouse.buttons[event.button] = true;
    };

    this.pointerUpCallback = (event) => {
      mouse.buttons[event.button] = false;
    };

    this.mousewheelCallback = (event) => {
      this.mouseWheelDeltaX += event.wheelDeltaX;
      this.mouseWheelDeltaY += event.wheelDeltaY;
    };

    // TODO: These listeners should be attached to the canvases in question
    window.addEventListener('pointerenter', this.pointerEnterCallback);
    window.addEventListener('pointerdown', this.pointerDownCallback);
    window.addEventListener('pointermove', this.pointerMoveCallback);
    window.addEventListener('pointerup', this.pointerUpCallback);
    window.addEventListener('mousewheel', this.mousewheelCallback);
  }

  execute() {
    // Update the mouse singleton with the latest movement deltas since the last frame.
    const mouse = this.singleton.get(MouseState);
    mouse.delta[0] = this.mouseDeltaX;
    mouse.delta[1] = this.mouseDeltaY;
    mouse.wheelDelta[0] = this.mouseWheelDeltaX;
    mouse.wheelDelta[1] = this.mouseWheelDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.mouseWheelDeltaX = 0;
    this.mouseWheelDeltaY = 0;

    const gamepad = this.singleton.get(GamepadState);
    gamepad.gamepads = [];
    const pads = navigator.getGamepads();
    if (pads) {
      for (const pad of pads) {
        if (pad) {
          gamepad.gamepads.push(pad);
        }
      }
    }
  }
}