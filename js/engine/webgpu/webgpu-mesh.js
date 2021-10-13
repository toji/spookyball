import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { WebGPUMaterialFactory, WebGPUMaterialBindGroups } from './materials/webgpu-materials.js';

class WebGPUMeshPrimitive {
  constructor(geometry, pipeline, bindGroups) {
    this.geometry = geometry;
    this.pipeline = pipeline;
    this.bindGroups = bindGroups || new WebGPUMaterialBindGroups();
  }
}

class WebGPUSkin {
  id;
  bindGroup;
}

export class WebGPUMeshSystem extends WebGPUSystem {
  stage = Stage.PreRender;

  #factories = new Map();
  #gpuMeshes = new WeakMap();
  #gpuSkins = new WeakMap();

  init(gpu) {
    const materialFactories = WebGPUMaterialFactory.getFactories();
    for (const [material, factoryConstructor] of materialFactories) {
      const factory = new factoryConstructor();
      this.#factories.set(material, factory);
      factory.init(gpu);
    }
  }

  getGPUSkin(gpu, skin) {
    if (!skin || !skin?.jointBuffer) return null;

    let gpuSkin = this.#gpuSkins.get(skin);
    if (!gpuSkin) {
      gpuSkin = new WebGPUSkin();
      gpuSkin.id = skin.id;
      gpuSkin.bindGroup = gpu.device.createBindGroup({
        label: `Skin[${skin.id}] BindGroup`,
        layout: gpu.bindGroupLayouts.skin,
        entries: [{
          binding: 0,
          resource: { buffer: skin.jointBuffer.gpuBuffer },
        }, {
          binding: 1,
          resource: { buffer: skin.ibmBuffer.gpuBuffer },
        }]
      });

      this.#gpuSkins.set(skin, gpuSkin);
    }
    return gpuSkin;
  }

  execute(delta, time, gpu) {
    const meshInstances = gpu.getFrameMeshInstances();
    for (const mesh of meshInstances.keys()) {
      const skin = this.getGPUSkin(gpu, mesh.skin);
      if (mesh.skin && !skin) {
        // If we get a skinned mesh without a joint buffer skip it.
        console.warn('Got a skinned mesh with no joint buffer');
        continue;
      }
      let gpuMesh = this.#gpuMeshes.get(mesh);
      if (!gpuMesh) {
        gpuMesh = [];
        for (const primitive of mesh.primitives) {
          const layout = primitive.geometry.layout;
          const material = primitive.material;
          const factory = this.#factories.get(material.constructor);
          if (!factory) {
            throw new Error(`No WebGPUMaterialFactory registered for ${material.constructor.name}`);
          }

          gpuMesh.push(new WebGPUMeshPrimitive(
            primitive.geometry,
            factory.getPipeline(gpu, layout, material, !!skin),
            factory.getBindGroup(gpu, material, skin)
          ));
        }
        this.#gpuMeshes.set(mesh, gpuMesh);
      }

      const instances = meshInstances.get(mesh);
      for (const primitive of gpuMesh) {
        for (const instance of instances) {
          gpu.renderBatch.addRenderable(primitive.geometry, primitive.pipeline, primitive.bindGroups, instance);
        }
      }
    }
  }
}
