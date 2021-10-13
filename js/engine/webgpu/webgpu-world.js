import { RenderWorld } from '../core/render-world.js';

import { WEBGPU_DEFAULT_FLAGS } from './webgpu-flags.js'
import { WebGPUSystem } from './webgpu-system.js';
import { WebGPUCamera } from './webgpu-camera.js';
import { WebGPUCameraSystem } from './webgpu-camera.js';
import { WebGPUClusteredLights } from './webgpu-clustered-light.js';
import { WebGPUMeshSystem } from './webgpu-mesh.js';
import { WebGPUShadowSystem } from './webgpu-shadow.js';
import { WebGPURenderer } from './webgpu-renderer.js';
import { WebGPUBloomSystem } from './webgpu-bloom.js';

class WebGPURenderPass extends WebGPUSystem {
  async init(gpu) {
    this.cameras = this.query(WebGPUCamera);
  }

  execute(delta, time, gpu) {
    this.cameras.forEach((entity, camera) => {
      gpu.render(camera);
      return false; // Don't try to process more than one camera.
    });
  }
}

export class WebGPUWorld extends RenderWorld {
  async intializeRenderer(flagOverrides) {
    // Apply the default flags and overwrite with any provided ones.
    const flags = Object.assign({}, WEBGPU_DEFAULT_FLAGS, flagOverrides);

    const renderer = new WebGPURenderer();
    await renderer.init(this.canvas, flags);

    // Unfortunately the order of these systems is kind of delicate.
    this.registerRenderSystem(WebGPUCameraSystem);
    this.registerRenderSystem(WebGPUClusteredLights);
    this.registerRenderSystem(WebGPUMeshSystem);

    if (flags.shadowsEnabled) {
      this.registerRenderSystem(WebGPUShadowSystem);
    }

    this.registerRenderSystem(WebGPURenderPass);

    if (flags.bloomEnabled) {
      this.registerRenderSystem(WebGPUBloomSystem);
    }

    return renderer;
  }
}