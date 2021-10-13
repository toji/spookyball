import { System } from '../core/ecs.js';
import { KeyboardState, MouseState } from '../core/input.js';
import { Transform } from '../core/transform.js';
import { vec3, vec2, quat } from 'gl-matrix';

export class FlyingControls {
  speed = 3;
  angles = vec2.create();
}

const TMP_DIR = vec3.create();

export class FlyingControlsSystem extends System {
  static queries = {
    flyingControls: { components: [FlyingControls, Transform] },
  };

  execute(delta) {
    const keyboard = this.singleton.get(KeyboardState);
    const mouse = this.singleton.get(MouseState);

    this.query(FlyingControls, Transform).forEach((entity, control, transform) => {
      // Handle Mouse state.
      if (mouse.buttons[0] && (mouse.delta[0] || mouse.delta[1])) {
        control.angles[1] += mouse.delta[0] * 0.025;
        // Keep our rotation in the range of [0, 2*PI]
        // (Prevents numeric instability if you spin around a LOT.)
        while (control.angles[1] < 0) {
          control.angles[1] += Math.PI * 2.0;
        }
        while (control.angles[1] >= Math.PI * 2.0) {
          control.angles[1] -= Math.PI * 2.0;
        }

        control.angles[0] += mouse.delta[1] * 0.025;
        // Clamp the up/down rotation to prevent us from flipping upside-down
        control.angles[0] = Math.min(Math.max(control.angles[0], -Math.PI*0.5), Math.PI*0.5);

        // Update the tranform rotation
        const q = transform.orientation;
        quat.identity(q);
        quat.rotateY(q, q, -control.angles[1]);
        quat.rotateX(q, q, -control.angles[0]);
      }

      // Handle keyboard state.
      vec3.set(TMP_DIR, 0, 0, 0);
      if (keyboard.keyPressed('KeyW')) {
        TMP_DIR[2] -= 1.0;
      }
      if (keyboard.keyPressed('KeyS')) {
        TMP_DIR[2] += 1.0;
      }
      if (keyboard.keyPressed('KeyA')) {
        TMP_DIR[0] -= 1.0;
      }
      if (keyboard.keyPressed('KeyD')) {
        TMP_DIR[0] += 1.0;
      }
      if (keyboard.keyPressed('Space')) {
        TMP_DIR[1] += 1.0;
      }
      if (keyboard.keyPressed('ShiftLeft')) {
        TMP_DIR[1] -= 1.0;
      }

      if (TMP_DIR[0] !== 0 || TMP_DIR[1] !== 0 || TMP_DIR[2] !== 0) {
        vec3.transformQuat(TMP_DIR, TMP_DIR, transform.orientation);
        vec3.normalize(TMP_DIR, TMP_DIR);
        vec3.scaleAndAdd(transform.position, transform.position, TMP_DIR, control.speed * delta);
      }
    });
  }
}