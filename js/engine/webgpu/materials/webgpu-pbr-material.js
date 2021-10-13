import { PBRMaterial } from '../../core/materials.js';
import { PBRFragmentSource, MATERIAL_BUFFER_SIZE } from '../wgsl/pbr-material.js';
import { WebGPUMaterialFactory } from './webgpu-material-factory.js';
import { vec4, vec3 } from 'gl-matrix';

// Can reuse these for every PBR material
const materialArray = new Float32Array(MATERIAL_BUFFER_SIZE / Float32Array.BYTES_PER_ELEMENT);
const baseColorFactor = new Float32Array(materialArray.buffer, 0, 4);
const emissiveFactor = new Float32Array(materialArray.buffer, 4 * 4, 3);
const metallicRoughnessFactor = new Float32Array(materialArray.buffer, 8 * 4, 2);

function isFullyRough(material) {
  return material.roughnessFactor == 1.0 && !material.metallicRoughnessTexture;
}

class WebGPUPBRMaterial extends WebGPUMaterialFactory {
  writesEmissive = true;

  init(gpu) {
    this.bindGroupLayout = gpu.device.createBindGroupLayout({
      label: 'PBR Material BindGroupLayout',
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
      },
      {
        binding: 3, // normalTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 4, // normalSampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 5, // metallicRoughnessTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 6, // metallicRoughnessSampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 7, // occlusionTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 8, // occlusionSampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 9, // emissiveTexture
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 10, // emissiveSampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      }]
    });
  }

  createBindGroup(gpu, material) {
    vec4.copy(baseColorFactor, material.baseColorFactor);
    vec3.copy(emissiveFactor, material.emissiveFactor);
    metallicRoughnessFactor[0] = material.metallicFactor;
    metallicRoughnessFactor[1] = material.roughnessFactor;
    materialArray[7] = material.occlusionStrength;
    materialArray[8] = material.alphaCutoff;

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
      },
      {
        binding: 3,
        resource: material.normalTexture || gpu.defaultNormalTextureView,
      },
      {
        binding: 4,
        resource: material.normalSampler || gpu.defaultSampler,
      },
      {
        binding: 5,
        resource: material.metallicRoughnessTexture || gpu.whiteTextureView,
      },
      {
        binding: 6,
        resource: material.metallicRoughnessSampler || gpu.defaultSampler,
      },
      {
        binding: 7,
        resource: material.occlusionTexture || gpu.whiteTextureView,
      },
      {
        binding: 8,
        resource: material.occlusionSampler || gpu.defaultSampler,
      },
      {
        binding: 9,
        resource: material.emissiveTexture || gpu.whiteTextureView,
      },
      {
        binding: 10,
        resource: material.emissiveSampler || gpu.defaultSampler,
      },]
    });
  }

  pipelineKey(geometryLayout, material, skinned) {
    return super.pipelineKey(geometryLayout, material, skinned) + `:${isFullyRough(material)}`;
  }

  createFragmentModule(gpu, geometryLayout, material) {
    return {
      module: gpu.device.createShaderModule({ code: PBRFragmentSource(geometryLayout, isFullyRough(material), gpu.flags) }),
      entryPoint: 'fragmentMain',
    };
  }
}

WebGPUMaterialFactory.register(PBRMaterial, WebGPUPBRMaterial);
