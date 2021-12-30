import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { WebGPUCamera } from './webgpu-camera.js';
import { FullscreenTexturedQuadVertexSource } from './wgsl/common.js';
import { DepthNormalPrepassFragmentSource, DepthResolveFragmentSource } from './wgsl/depth.js';

export class WebGPUDepthPrepassSystem extends WebGPUSystem {
  stage = Stage.DepthRender;

  #depthPipelineCache = new WeakMap();

  init(gpu) {
    this.cameraQuery = this.query(WebGPUCamera);

    if (gpu.flags.ssaoEnabled && gpu.renderTargets.sampleCount > 1) {
      this.depthResolvePipeline = gpu.device.createRenderPipeline({
        label: `Depth Resolve Pipeline`,
        vertex: {
          module: gpu.device.createShaderModule({
            code: FullscreenTexturedQuadVertexSource,
            label: 'Depth Resolve Vertex'
          }),
          entryPoint: 'vertexMain'
        },
        fragment: {
          module: gpu.device.createShaderModule({
            code: DepthResolveFragmentSource,
            label: 'Depth Resolve Fragment'
          }),
          entryPoint: 'fragmentMain',
          targets: [],
        },
        depthStencil: {
          format: gpu.renderTargets.depthFormat,
          depthWriteEnabled: true,
        },
      });
    }

    gpu.renderTargets.addEventListener('reconfigured', () => {
      this.onRenderTargetsReconfigured(gpu);
    });
    this.onRenderTargetsReconfigured(gpu);
  }

  getOrCreateDepthPipeline(gpu, webgpuPipeline) {
    let depthPipeline = this.#depthPipelineCache.get(webgpuPipeline);
    if (!depthPipeline) {
      depthPipeline = this.createDepthPipeline(gpu, webgpuPipeline);
      this.#depthPipelineCache.set(webgpuPipeline, depthPipeline);
    }
    return depthPipeline;
  }

  createDepthPipeline(gpu, webgpuPipeline) {
    const code = gpu.flags.ssaoEnabled ?
        DepthNormalPrepassFragmentSource(webgpuPipeline.layout) :
        DepthPrepassFragmentSource(webgpuPipeline.layout);

    const targets = [];
    if (gpu.flags.ssaoEnabled) {
      targets.push({
        format: gpu.renderTargets.format,
      });
    }

    return gpu.device.createRenderPipeline({
      label: `Depth Only Pipeline For PipelineID: ${webgpuPipeline.pipelineId})`,
      layout: webgpuPipeline.pipelineLayout,
      vertex: webgpuPipeline.vertex,
      fragment: {
        module: gpu.device.createShaderModule({
          label: `Depth Only Fragment shader module (Layout: ${webgpuPipeline.layout.id})`,
          code
        }),
        entryPoint: 'fragmentMain',
        targets
      },
      primitive: {
        topology: webgpuPipeline.layout.primitive.topology,
        stripIndexFormat: webgpuPipeline.layout.primitive.stripIndexFormat,
        cullMode: webgpuPipeline.doubleSided ? 'none' : 'back',
      },
      depthStencil: {
        depthWriteEnabled: webgpuPipeline.depthWrite,
        depthCompare: webgpuPipeline.depthCompare,
        format: gpu.renderTargets.depthFormat,
      },
      multisample: {
        count: gpu.renderTargets.sampleCount
      }
    });
  }

  onRenderTargetsReconfigured(gpu) {
    let depthView;
    if (gpu.renderTargets.sampleCount > 1) {
      depthView = gpu.renderTargets.msaaDepthTexture.createView();
    } else {
      depthView = gpu.renderTargets.depthTexture.createView();
    }

    this.colorAttachments = [];

    if (gpu.flags.ssaoEnabled) {
      if (gpu.renderTargets.sampleCount > 1) {
        this.colorAttachments.push({
          view: gpu.renderTargets.msaaNormalTexture.createView(),
          resolveTarget: gpu.renderTargets.normalTexture.createView(),
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: 'discard',
        });
      } else {
        this.colorAttachments.push({
          view: gpu.renderTargets.normalTexture.createView(),
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: 'store',
        });
      }
    }

    this.depthStencilAttachment = {
      view: depthView,
      depthLoadValue: 1.0,
      depthStoreOp: 'store',
      stencilLoadValue: 0,
      stencilStoreOp: 'discard',
    };

    if (gpu.flags.ssaoEnabled && gpu.renderTargets.sampleCount > 1) {
      this.depthResolvePassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: {
          view: gpu.renderTargets.depthTexture.createView(),
          depthLoadValue: 1.0,
          depthStoreOp: 'store',
          stencilLoadValue: 0.0,
          stencilStoreOp: 'discard'
        }
      };

      this.depthResolveBindGroup = gpu.device.createBindGroup({
        layout: this.depthResolvePipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: gpu.renderTargets.msaaDepthTexture.createView(),
        }],
      });
    }
  }

  execute(delta, time, gpu) {
    this.cameraQuery.forEach((entity, camera) => {
      const instanceBuffer = gpu.renderBatch.instanceBuffer;

      // TODO: Should be able to have a single command encoder for all render passes
      const commandEncoder = gpu.device.createCommandEncoder({});

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: this.colorAttachments,
        depthStencilAttachment: this.depthStencilAttachment
      });

      passEncoder.setBindGroup(0, camera.bindGroup);

      // Loop through all the renderable entities and store them by pipeline.
      for (const pipeline of gpu.renderBatch.sortedPipelines) {
        if (!pipeline.layout || pipeline.transparent) { continue; }

        const depthPipeline = this.getOrCreateDepthPipeline(gpu, pipeline);
        passEncoder.setPipeline(depthPipeline);

        const geometryList = gpu.renderBatch.pipelineGeometries.get(pipeline);
        for (const [geometry, materialList] of geometryList) {

          for (const vb of geometry.vertexBuffers) {
            passEncoder.setVertexBuffer(vb.slot, vb.buffer.gpuBuffer, vb.offset);
          }
          const ib = geometry.indexBuffer;
          if (ib) {
            passEncoder.setIndexBuffer(ib.buffer.gpuBuffer, ib.format, ib.offset);
          }

          for (const [material, instances] of materialList) {
            if (material) {
              let i = material.firstBindGroupIndex;
              for (const bindGroup of material.bindGroups) {
                passEncoder.setBindGroup(i++, bindGroup);
              }
            }

            if (pipeline.instanceSlot >= 0) {
              passEncoder.setVertexBuffer(pipeline.instanceSlot, instanceBuffer, instances.bufferOffset);
            }

            if (ib) {
              passEncoder.drawIndexed(geometry.drawCount, instances.instanceCount);
            } else {
              passEncoder.draw(geometry.drawCount, instances.instanceCount);
            }

            // Restore the camera binding if needed
            if (material?.firstBindGroupIndex == 0) {
              passEncoder.setBindGroup(0, camera.bindGroup);
            }
          }
        }
      }

      passEncoder.endPass();

      if (gpu.flags.ssaoEnabled && gpu.renderTargets.sampleCount > 1) {
        // Resolve the MSAA depth target
        const passEncoder = commandEncoder.beginRenderPass(this.depthResolvePassDescriptor);

        passEncoder.setPipeline(this.depthResolvePipeline);
        passEncoder.setBindGroup(0, this.depthResolveBindGroup);
        passEncoder.draw(3);

        passEncoder.endPass();
      }

      gpu.device.queue.submit([commandEncoder.finish()]);
    });
  }
}
