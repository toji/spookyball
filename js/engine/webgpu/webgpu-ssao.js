import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { FullscreenTexturedQuadVertexSource } from './wgsl/common.js';
import { SSAOFragmentSource } from './wgsl/ssao.js';
import { WebGPUCamera } from './webgpu-camera.js';
import { vec3 } from 'gl-matrix';

const SSAO_SAMPLES = 64;

export class WebGPUSSAOSystem extends WebGPUSystem {
  stage = Stage.PostRender;

  init(gpu) {
    this.ssaoTextureBGL = this.model = gpu.device.createBindGroupLayout({
      label: `SSAO Texture BindGroupLayout`,
      entries: [{
        binding: 0, // Depth texture
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' },
      },
      {
        binding: 1, // Normal texture
        visibility: GPUShaderStage.FRAGMENT,
        texture: { },
      },
      {
        binding: 2, // Noise texture
        visibility: GPUShaderStage.FRAGMENT,
        texture: { },
      },
      {
        binding: 3, // Sample kernel texture
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' },
      }]
    });

    this.ssaoPipeline = gpu.device.createRenderPipeline({
      label: `SSAO Pipeline`,
      layout: gpu.device.createPipelineLayout({
        bindGroupLayouts: [
          gpu.bindGroupLayouts.frame,
          this.ssaoTextureBGL,
        ]
      }),
      vertex: {
        module: gpu.device.createShaderModule({
          code: FullscreenTexturedQuadVertexSource,
          label: 'SSAO Vertex'
        }),
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: gpu.device.createShaderModule({
          code: SSAOFragmentSource,
          label: 'SSAO Fragment'
        }),
        entryPoint: 'fragmentMain',
        targets: [{
          format: 'r8unorm',
        }],
      }
    });

    this.noiseTexture = gpu.textureLoader.fromNoise(256, 256).texture;

    this.sampleBuffer = gpu.device.createBuffer({
      size: (3 * Float32Array.BYTES_PER_ELEMENT * SSAO_SAMPLES) + Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });

    const sampleBufferArrayBuffer = this.sampleBuffer.getMappedRange();

    new Uint32Array(sampleBufferArrayBuffer, 0, 1)[0] = SSAO_SAMPLES;

    // Generate a random hemisphere of samples
    for (let i = 0; i < SSAO_SAMPLES; ++i) {
      const v = new Float32Array(sampleBufferArrayBuffer, i * 12 + 4, 3);
      do {
        v[0] = Math.random() * 2.0 - 1.0;
        v[1] = Math.random() * 2.0 - 1.0;
        v[2] = Math.random();
      } while (vec3.length(v) <= 1.0);
    }
    this.sampleBuffer.unmap();

    gpu.renderTargets.addEventListener('reconfigured', () => {
      this.onRenderTargetsReconfigured(gpu);
    });
    this.onRenderTargetsReconfigured(gpu);
  }

  onRenderTargetsReconfigured(gpu) {
    // Allocate the ssao texture.
    this.ssaoTexture = gpu.device.createTexture({
      label: 'SSAO target',
      size: gpu.renderTargets.size,
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.ssaoBindGroup = gpu.device.createBindGroup({
      label: 'Bloom Blur Pass 0 Bind Group',
      layout: this.ssaoTextureBGL,
      entries: [{
        binding: 0,
        resource: gpu.renderTargets.depthTexture.createView(),
      }, {
        binding: 1,
        resource: gpu.renderTargets.normalTexture.createView(),
      }, {
        binding: 2,
        resource: this.noiseTexture.createView(),
      }, {
        binding: 3,
        resource: {
          buffer: this.sampleBuffer,
        }
      }]
    });

    this.ssaoColorAttachments = [{
      view: this.ssaoTexture.createView(),
      loadValue: {r: 0, g: 0, b: 0, a: 1.0},
      storeOp: 'store',
    }];
  }

  execute(delta, time, gpu) {
    this.query(WebGPUCamera).forEach((entity, camera) => {
      const commandEncoder = gpu.device.createCommandEncoder({});

      // SSAO pass
      let passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: this.ssaoColorAttachments,
      });

      passEncoder.setPipeline(this.ssaoPipeline);
      passEncoder.setBindGroup(0, camera.bindGroup);
      passEncoder.setBindGroup(1, this.ssaoBindGroup);
      passEncoder.draw(3);
      passEncoder.endPass();

      gpu.device.queue.submit([commandEncoder.finish()]);

      return false;
    });
  }
}