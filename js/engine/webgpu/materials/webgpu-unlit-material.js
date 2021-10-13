import { UnlitMaterial } from '../../core/materials.js';
import { UnlitFragmentSource, MATERIAL_BUFFER_SIZE } from '../wgsl/unlit-material.js';
import { WebGPUMaterialFactory } from './webgpu-material-factory.js';
import { vec4 } from 'gl-matrix';

// Can reuse these for every unlit material
const materialArray = new Float32Array(MATERIAL_BUFFER_SIZE / Float32Array.BYTES_PER_ELEMENT);
const baseColorFactor = new Float32Array(materialArray.buffer, 0, 4);

export class WebGPUUnlitMaterial extends WebGPUMaterialFactory {
  init(gpu) {
    this.bindGroupLayout = gpu.device.createBindGroupLayout({
      label: 'Unlit Material BindGroupLayout',
      entries: [{
        binding: 0, // Uniform Buffer
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}
      },
      {
        binding: 1, // baseColorTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 2, // baseColorSampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      }]
    });
  }

  createBindGroup(gpu, material) {
    vec4.copy(baseColorFactor, material.baseColorFactor);
    materialArray[4] = material.alphaCutoff;

    const materialBuffer = gpu.device.createBuffer({
      size: MATERIAL_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    gpu.device.queue.writeBuffer(materialBuffer, 0, materialArray);

    return gpu.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: materialBuffer },
      },
      {
        binding: 1,
        resource: material.baseColorTexture || gpu.whiteTextureView,
      },
      {
        binding: 2,
        resource: material.baseColorSampler || gpu.defaultSampler,
      }]
    });
  }

  createFragmentModule(gpu, geometryLayout, material) {
    return {
      module: gpu.device.createShaderModule({ code: UnlitFragmentSource(geometryLayout) }),
      entryPoint: 'fragmentMain',
    };
  }
}

WebGPUMaterialFactory.register(UnlitMaterial, WebGPUUnlitMaterial);