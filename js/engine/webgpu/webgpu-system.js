import { System } from '../core/ecs.js';
import { Stage } from '../core/stage.js';

export class WebGPUSystem extends System {
  stage = Stage.Render;
};
