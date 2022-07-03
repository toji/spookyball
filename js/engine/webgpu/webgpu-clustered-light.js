// Lots of this is ported or otherwise influenced by http://www.aortiz.me/2018/12/21/CG.html and
// https://github.com/Angelo1211/HybridRenderingEngine

import { WebGPUSystem } from './webgpu-system.js';
import { WebGPUCamera } from './webgpu-camera.js';
import {
  DISPATCH_SIZE,
  ClusterBoundsSource,
  ClusterLightsSource
} from './wgsl/clustered-light.js';

const emptyArray = new Uint32Array(1);

export class WebGPUClusteredLights extends WebGPUSystem {
  #outputSize = {width: 0, height: 0};
  #zRange = [0, 0];

  init(gpu) {
    const device = gpu.device;

    // Pipeline creation
    device.createComputePipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          gpu.bindGroupLayouts.frame,
          gpu.bindGroupLayouts.clusterBounds,
        ]
      }),
      compute: {
        module: device.createShaderModule({ code: ClusterBoundsSource, label: "Cluster Bounds" }),
        entryPoint: 'computeMain',
      }
    }).then((pipeline) => {
      this.boundsPipeline = pipeline;
    });

    device.createComputePipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          gpu.bindGroupLayouts.clusterLights,
        ]
      }),
      compute: {
        module: device.createShaderModule({ code: ClusterLightsSource, label: "Cluster Lights" }),
        entryPoint: 'computeMain',
      }
    }).then((pipeline) => {
      this.lightsPipeline = pipeline;
    });
  }

  updateClusterBounds(gpu, camera) {
    if (!this.boundsPipeline ||
      (this.#outputSize.width == gpu.renderTargets.size.width &&
      this.#outputSize.height == gpu.renderTargets.size.height &&
      this.#zRange[0] == camera.zRange[0] &&
      this.#zRange[1] == camera.zRange[1])) {
      return;
    }

    // TODO: This should really be updated for any change in the camera
    this.#outputSize.width = gpu.renderTargets.size.width;
    this.#outputSize.height = gpu.renderTargets.size.height;
    this.#zRange[0] = camera.zRange[0];
    this.#zRange[1] = camera.zRange[1];

    const commandEncoder = gpu.device.createCommandEncoder({ label: 'Cluster Bounds Command Encoder'});

    const passEncoder = commandEncoder.beginComputePass({ label: 'Cluster Bounds Compute Pass'});
    passEncoder.setPipeline(this.boundsPipeline);
    passEncoder.setBindGroup(0, camera.bindGroup);
    passEncoder.setBindGroup(1, camera.clusterBoundsBindGroup);
    passEncoder.dispatchWorkgroups(...DISPATCH_SIZE);
    passEncoder.end();

    gpu.device.queue.submit([commandEncoder.finish()]);
  }

  updateClusterLights(gpu, camera) {
    if (!this.lightsPipeline) { return; }

    // Reset the light offset counter to 0 before populating the light clusters.
    gpu.device.queue.writeBuffer(camera.clusterLightsBuffer, 0, emptyArray);

    const commandEncoder = gpu.device.createCommandEncoder();

    // Update the FrameUniforms buffer with the values that are used by every
    // program and don't change for the duration of the frame.
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.lightsPipeline);
    passEncoder.setBindGroup(0, camera.clusterLightsBindGroup);
    passEncoder.dispatchWorkgroups(...DISPATCH_SIZE);
    passEncoder.end();

    gpu.device.queue.submit([commandEncoder.finish()]);
  }

  execute(delta, time, gpu) {
    this.query(WebGPUCamera).forEach((entity, camera) => {
      this.updateClusterBounds(gpu, camera);
      this.updateClusterLights(gpu, camera);
    });
  }
}
