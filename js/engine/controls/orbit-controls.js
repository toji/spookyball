import { System } from '../core/ecs.js';
import { MouseState, GamepadState } from '../core/input.js';
import { Transform } from '../core/transform.js';
import { vec3, vec2, quat } from 'gl-matrix';

export class OrbitControls {
  target = vec3.create();
  angle = vec2.create();
  distance = 5;
  maxAngleX = Math.PI * 0.5;
  minAngleX = -Math.PI * 0.5;
  maxAngleY = Math.PI;
  minAngleY = -Math.PI;
  constrainXAngle = true;
  constrainYAngle = false;
  maxDistance = 10;
  minDistance = 1;
  distanceStep = 0.005;
  constrainDistance = true;
}

export class OrbitControlsSystem extends System {
  execute() {
    const mouse = this.singleton.get(MouseState);
    const gamepad = this.singleton.get(GamepadState);

    this.query(OrbitControls, Transform).forEach((entity, control, transform) => {
      let updated = false;

      // Handle Mouse state.
      if (mouse.buttons[0] && (mouse.delta[0] || mouse.delta[1])) {
        control.angle[1] += mouse.delta[0] * 0.025;
        control.angle[0] += mouse.delta[1] * 0.025;
        updated = true;
      }

      if (mouse.wheelDelta[1]) {
        control.distance += (-mouse.wheelDelta[1] * control.distanceStep);
        updated = true;
      }

      // Handle Gamepad state
      for (const pad of gamepad.gamepads) {
        if (pad.axes.length > 3) {
          const x = Math.abs(pad.axes[2]) > 0.1 ? pad.axes[2] : 0;
          const y = Math.abs(pad.axes[3]) > 0.1 ? pad.axes[3] : 0;
          if (x || y) {
            control.angle[1] += x * 0.025;
            control.angle[0] -= y * 0.025;
            updated = true;
          }
        }
      }

      // Constrain the motion if necessary
      if (updated) {
        if(control.constrainYAngle) {
          control.angle[1] = Math.min(Math.max(control.angle[1], control.minAngleY), control.maxAngleY);
        } else {
          while (control.angle[1] < -Math.PI) {
            control.angle[1] += Math.PI * 2;
          }
          while (control.angle[1] >= Math.PI) {
            control.angle[1] -= Math.PI * 2;
          }
        }

        if(control.constrainXAngle) {
          control.angle[0] = Math.min(Math.max(control.angle[0], control.minAngleX), control.maxAngleX);
        } else {
          while (control.angle[0] < -Math.PI) {
            control.angle[0] += Math.PI * 2;
          }
          while (control.angle[0] >= Math.PI) {
            control.angle[0] -= Math.PI * 2;
          }
        }

        if(control.constrainDistance) {
          control.distance = Math.min(Math.max(control.distance, control.minDistance), control.maxDistance);
        }
      }

      // Update the orientation
      const q = transform.orientation;
      quat.identity(q);
      quat.rotateY(q, q, -control.angle[1]);
      quat.rotateX(q, q, -control.angle[0]);

      // Update the position
      vec3.set(transform.position, 0, 0, control.distance);
      vec3.transformQuat(transform.position, transform.position, transform.orientation);
      vec3.add(transform.position, transform.position, control.target);
    });
  }
}