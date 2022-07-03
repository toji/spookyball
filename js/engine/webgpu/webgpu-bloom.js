import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { FullscreenTexturedQuadVertexSource } from './wgsl/common.js';
import { BloomBlurHorizontalFragmentSource, BloomBlurVerticalFragmentSource, BloomBlendFragmentSource } from './wgsl/bloom.js';

export class WebGPUBloomSystem extends WebGPUSystem {
  stage = Stage.PostRender;
  frameIndex = 0;
  init(gpu) {
    // Setup a render pipeline for drawing debug views of textured quads
    this.blurHorizonalPipeline = gpu.device.createRenderPipeline({
      label: `Bloom Blur Horizontal Pipeline`,
      layout: 'auto',
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'Bloom Blur Horizontal Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: BloomBlurHorizontalFragmentSource,
          label: 'Bloom Blur Horizontal Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [{
          format: gpu.renderTargets.format,
        }],
      }
    });

    this.blurVerticalPipeline = gpu.device.createRenderPipeline({
      label: `Bloom Blur Vertical Pipeline`,
      layout: 'auto',
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'Bloom Blur Vertical Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: BloomBlurVerticalFragmentSource,
          label: 'Bloom Blur Vertical Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [ {
          format: gpu.renderTargets.format,
        }],
      }
    });

    this.blendPipeline = gpu.device.createRenderPipeline({
      label: `Bloom Blend Pipeline`,
      layout: 'auto',
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'Bloom Blend Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: BloomBlendFragmentSource,
          label: 'Bloom Blend Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [{
          format: gpu.renderTargets.format,
          // Additive blending
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one',
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
            }
          }
        }],
      }
    });

    this.blurUniformBuffer = gpu.device.createBuffer({
      size: 4 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM,
      mappedAtCreation: true,
    });

    const blurArray = new Float32Array(this.blurUniformBuffer.getMappedRange());
    blurArray[0] = 1; // Bloom radius
    blurArray[1] = 0.5; // Glow historical dimming amount
    this.blurUniformBuffer.unmap();

    gpu.renderTargets.addEventListener('reconfigured', () => {
      this.onRenderTargetsReconfigured(gpu);
    });
    this.onRenderTargetsReconfigured(gpu);
  }

  onRenderTargetsReconfigured(gpu) {
    this.pass0BindGroup = gpu.device.createBindGroup({
      label: 'Bloom Blur Pass 0 Bind Group',
      layout: this.blurHorizonalPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: this.blurUniformBuffer },
      }, {
        binding: 1,
        resource: gpu.renderTargets.emissiveTexture.createView(),
      }, {
        binding: 2,
        resource: gpu.defaultSampler,
      }]
    });

    this.pass1BindGroups = [
      gpu.device.createBindGroup({
        label: 'Bloom Blur Pass 1 Bind Group A',
        layout: this.blurVerticalPipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: this.blurUniformBuffer },
        }, {
          binding: 1,
          resource: gpu.renderTargets.bloomTextures[0].createView(),
        }, {
          binding: 2,
          resource: gpu.defaultSampler,
        }, {
          binding: 3,
          resource: gpu.renderTargets.bloomTextures[2].createView(),
        }]
      }),
      gpu.device.createBindGroup({
        label: 'Bloom Blur Pass 1 Bind Group B',
        layout: this.blurVerticalPipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: this.blurUniformBuffer },
        }, {
          binding: 1,
          resource: gpu.renderTargets.bloomTextures[0].createView(),
        }, {
          binding: 2,
          resource: gpu.defaultSampler,
        }, {
          binding: 3,
          resource: gpu.renderTargets.bloomTextures[1].createView(),
        }]
      }),
    ];

    this.blendPassBindGroups = [
      gpu.device.createBindGroup({
        label: 'Bloom blend pass Bind Group A',
        layout: this.blendPipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: gpu.renderTargets.bloomTextures[1].createView(),
        }, {
          binding: 1,
          resource: gpu.defaultSampler,
        }]
      }),
      gpu.device.createBindGroup({
        label: 'Bloom blend pass Bind Group B',
        layout: this.blendPipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: gpu.renderTargets.bloomTextures[2].createView(),
        }, {
          binding: 1,
          resource: gpu.defaultSampler,
        }]
      }),
    ];
  }

  execute(delta, time, gpu) {
    const bloomTextures = gpu.renderTargets.bloomTextures;
    const commandEncoder = gpu.device.createCommandEncoder({});

    const pingPongIndex = this.frameIndex % 2;

    // 1st pass (Horizontal blur)
    let passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: bloomTextures[0].createView(),
        clearValue: {r: 0, g: 0, b: 0, a: 1.0},
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(this.blurHorizonalPipeline);
    passEncoder.setBindGroup(0, this.pass0BindGroup);
    passEncoder.draw(3);
    passEncoder.end();

    // 2nd pass (Vertical blur)
    passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: bloomTextures[1 + pingPongIndex].createView(),
        clearValue: {r: 0, g: 0, b: 0, a: 1.0},
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(this.blurVerticalPipeline);
    passEncoder.setBindGroup(0, this.pass1BindGroups[pingPongIndex]);
    passEncoder.draw(3);
    passEncoder.end();

    // Blend pass
    passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: gpu.renderTargets.context.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(this.blendPipeline);
    passEncoder.setBindGroup(0, this.blendPassBindGroups[pingPongIndex]);
    passEncoder.draw(3);
    passEncoder.end();

    gpu.device.queue.submit([commandEncoder.finish()]);

    this.frameIndex++;
  }
}