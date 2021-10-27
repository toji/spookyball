import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { FullscreenTexturedQuadVertexSource, ShadowDebugFragmentSource, TextureDebugFragmentSource } from './wgsl/common.js';

export class WebGPUDebugTextureView {
  bindGroup;
  constructor(textureView, isShadow) {
    this.textureView = textureView;
    this.isShadow = isShadow;
  }
}

export class WebGPUTextureDebugSystem extends WebGPUSystem {
  stage = Stage.PostRender;

  init(gpu) {
    // Setup a render pipeline for drawing debug views of textured quads
    this.pipeline = gpu.device.createRenderPipeline({
      label: `Texture Debug Pipeline`,
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'Texture Debug Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: TextureDebugFragmentSource,
          label: 'Texture Debug Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [{
          format: gpu.renderTargets.format,
        }],
      }
    });

    this.shadowPipeline = gpu.device.createRenderPipeline({
      label: `Shadow Texture Debug Pipeline`,
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'Shadow Texture Debug Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: ShadowDebugFragmentSource,
          label: 'Shadow Texture Debug Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [{
          format: gpu.renderTargets.format,
        }],
      }
    });
  }

  execute(delta, time, gpu) {
    let textureCount = 0;
    this.query(WebGPUDebugTextureView).forEach((entity, textureView) => {
      if (!textureView.bindGroup) {
        textureView.bindGroup = gpu.device.createBindGroup({
          label: 'Texture Debug Bind Group',
          layout: textureView.isShadow ? this.shadowPipeline.getBindGroupLayout(0) : this.pipeline.getBindGroupLayout(0),
          entries: [{
            binding: 0,
            resource: textureView.textureView,
          }, {
            binding: 1,
            resource: gpu.defaultSampler,
          }]
        });
      }
      textureCount++;
    });

    if (!textureCount) { return; }

    const outputTexture = gpu.renderTargets.context.getCurrentTexture();
    const commandEncoder = gpu.device.createCommandEncoder({});

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: outputTexture.createView(),
        loadValue: {r: 0, g: 0, b: 0, a: 1.0},
        storeOp: 'store',
      }],
    });

    this.query(WebGPUDebugTextureView).forEach((entity, textureView) => {
      passEncoder.setPipeline(textureView.isShadow ? this.shadowPipeline : this.pipeline);
      passEncoder.setBindGroup(0, textureView.bindGroup);
      passEncoder.draw(3);
    })

    passEncoder.endPass();

    gpu.device.queue.submit([commandEncoder.finish()]);
  }
}