import { SkyboxMaterial } from '../../core/skybox.js';
import { SkyboxVertexSource, SkyboxFragmentSource } from '../wgsl/skybox.js';
import { WebGPUMaterialFactory, RenderOrder, WebGPUMaterialPipeline } from './webgpu-material-factory.js';

export class WebGPUSkyboxMaterial extends WebGPUMaterialFactory {
  init(gpu) {
    this.bindGroupLayout = gpu.device.createBindGroupLayout({
      label: 'Skybox BindGroupLayout',
      entries: [{
        binding: 0, // skyboxTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: { viewDimension: 'cube' }
      }]
    });

    const vertexModule = gpu.device.createShaderModule({
      code: SkyboxVertexSource,
      label: 'Skybox Vertex'
    });

    const fragmentModule = gpu.device.createShaderModule({
      code: SkyboxFragmentSource,
      label: 'Skybox Fragment'
    });

    const fragmentTargets = [{
      format: gpu.renderTargets.format,
    }]

    if (gpu.flags.bloomEnabled) {
      fragmentTargets.push({
        format: gpu.renderTargets.format,
        writeMask: 0,
      });
    }

    const pipeline = gpu.device.createRenderPipeline({
      label: `Skybox Pipeline`,
      layout: gpu.device.createPipelineLayout({
        bindGroupLayouts: [
          gpu.bindGroupLayouts.frame,
          this.bindGroupLayout,
        ]
      }),
      vertex: {
        module: vertexModule,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
          attributes: [{
            shaderLocation: 0,
            format: 'float32x3',
            offset: 0,
          }]
        }]
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: fragmentTargets,
      },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: gpu.renderTargets.depthFormat,
      },
      multisample: {
        count: gpu.renderTargets.sampleCount,
      }
    });

    this.gpuPipeline = new WebGPUMaterialPipeline({
      pipeline,
      renderOrder: RenderOrder.Skybox
    });
  }

  createBindGroup(gpu, material) {
    return gpu.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{
        binding: 0,
        resource: material.texture.createView({ dimension: 'cube' }),
      }]
    });
  }

  getPipeline(gpu, geometryLayout, material, skinned) {
    return this.gpuPipeline;
  }
}

WebGPUMaterialFactory.register(SkyboxMaterial, WebGPUSkyboxMaterial);