import { AttributeLocation } from '../../core/mesh.js';
import { DefaultVertexSource } from '../wgsl/default-vertex.js';

export const RenderOrder = {
  First: 0,
  Default: 1,
  Skybox: 2,
  Transparent: 3,
  Last: 4
};

let nextPipelineId = 1;

export class WebGPUMaterialPipeline {
  constructor(options) {
    this.pipelineId = nextPipelineId++;
    this.pipeline = options?.pipeline ?? null;
    this.pipelineLayout = options?.pipelineLayout ?? null;
    this.vertex = options?.vertex ?? null;
    this.renderOrder = options?.renderOrder ?? RenderOrder.Default
    this.instanceSlot = options?.instanceSlot ?? -1;
    this.layout = options?.layout ?? null;
    this.skinned = options?.skinned ?? false;
  }
}

export class WebGPUMaterialBindGroups {
  firstBindGroupIndex = 1;
  castsShadow = true;
  bindGroups = [];
  constructor(...bg) {
    this.bindGroups.push(...bg);
  }
}

const INSTANCE_BUFFER_LAYOUT = {
  arrayStride: 80,
  stepMode: 'instance',
  attributes: [
  // Transform matrix (4x4)
  {
    format: 'float32x4',
    offset: 0,
    shaderLocation: AttributeLocation.maxAttributeLocation,
  }, {
    format: 'float32x4',
    offset: 16,
    shaderLocation: AttributeLocation.maxAttributeLocation+1,
  }, {
    format: 'float32x4',
    offset: 32,
    shaderLocation: AttributeLocation.maxAttributeLocation+2,
  }, {
    format: 'float32x4',
    offset: 48,
    shaderLocation: AttributeLocation.maxAttributeLocation+3,
  },
  
  // Instance Color
  {
    format: 'float32x4',
    offset: 64,
    shaderLocation: AttributeLocation.maxAttributeLocation+4,
  }]
};

const materialFactories = new Map();

export class WebGPUMaterialFactory {
  renderOrder = RenderOrder.Default;
  writesEmissive = false;

  #pipelineCache = new Map();
  #materialCache = new Map();

  static register(material, factory) {
    materialFactories.set(material, factory);
  }

  static getFactories() {
    return materialFactories;
  }

  init(gpu) {}

  getPipeline(gpu, geometryLayout, material, skinned) {
    const key = this.pipelineKey(geometryLayout, material, skinned);
    let gpuPipeline = this.#pipelineCache.get(key);
    if (!gpuPipeline) {
      const vertex = this.createVertexModule(gpu, geometryLayout, material, skinned);
      const fragment = this.createFragmentModule(gpu, geometryLayout, material);

      vertex.buffers = new Array(...geometryLayout.buffers);

      // Add a vertexSlot for the instance array
      vertex.buffers.push(INSTANCE_BUFFER_LAYOUT);

      const pipelineLayout = this.createPipelineLayout(gpu, skinned);
      const pipeline = this.createPipeline(gpu, geometryLayout, vertex, fragment, material, pipelineLayout);
      if (!pipeline) { return; }

      gpuPipeline = new WebGPUMaterialPipeline({
        pipeline,
        pipelineLayout,
        vertex,
        renderOrder: material.transparent ? RenderOrder.Transparent : this.renderOrder,
        instanceSlot: geometryLayout.buffers.length,
        layout: geometryLayout,
        skinned
      });
      this.#pipelineCache.set(key, gpuPipeline);
    }
    return gpuPipeline;
  }

  getBindGroup(gpu, material, skin) {
    const key = `${material.id};${skin?.id || -1}`;
    let bindGroup = this.#materialCache.get(key);
    if (!bindGroup) {
      const bindGroupList = [this.createBindGroup(gpu, material)];
      if (skin) {
        bindGroupList.push(skin.bindGroup);
      }
      bindGroup = new WebGPUMaterialBindGroups(...bindGroupList);
      bindGroup.castsShadow = material.castsShadow;
      this.#materialCache.set(key, bindGroup);
    }
    return bindGroup;
  }

  pipelineKey(geometryLayout, material, skinned) {
    return `${geometryLayout.id};${material.transparent};${material.doubleSided};${material.depthWrite};${material.depthCompare};${skinned}`;
  }

  createPipelineLayout(gpu, skinned = false) {
    const bindGroupLayouts = [
      gpu.bindGroupLayouts.frame,
    ];

    if (this.bindGroupLayout) {
      bindGroupLayouts.push(this.bindGroupLayout);
    }

    if (skinned) {
      bindGroupLayouts.push(gpu.bindGroupLayouts.skin);
    }

    return gpu.device.createPipelineLayout({ bindGroupLayouts });
  }

  // Creates a pipeline with defaults settings and the overridden shaders.
  // Can be customize if needed.
  createPipeline(gpu, layout, vertex, fragment, material, pipelineLayout) {
    let blend;
    if (material?.transparent) {
      if (material?.additiveBlend) {
        blend = {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one",
          }
        };
      } else {
        blend = {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one",
          }
        };
      }
    }

    fragment.targets = [{
      format: gpu.renderTargets.format,
      blend,
    }];

    if (gpu.flags.bloomEnabled) {
      fragment.targets.push({
        format: gpu.renderTargets.format,
        blend,
        writeMask: this.writesEmissive ? GPUColorWrite.ALL : 0,
      });
    }

    return gpu.device.createRenderPipeline({
      label: `${material.constructor.name} Pipeline (LayoutID: ${layout.id})`,
      layout: pipelineLayout,
      vertex,
      fragment,
      primitive: {
        topology: layout.primitive.topology,
        stripIndexFormat: layout.primitive.stripIndexFormat,
        cullMode: material.doubleSided ? 'none' : 'back',
      },
      depthStencil: {
        format: gpu.renderTargets.depthFormat,
        depthWriteEnabled: material.depthWrite,
        depthCompare: material.depthCompare,
      },
      multisample: { count: gpu.renderTargets.sampleCount, },
    });
  }

  createVertexModule(gpu, geometryLayout, material, skinned) {
    return {
      module: gpu.device.createShaderModule({ code: DefaultVertexSource(geometryLayout, skinned) }),
      entryPoint: 'vertexMain',
    };
  }

  createFragmentModule(gpu, geometryLayout, material) {
    throw new Error('Must override createFragmentModule() for each class that extends WebGPUMaterialShader.');
  }

  createBindGroup(gpu, material) {
    return null; // Some materials may not require a given bind group.
  }
}
