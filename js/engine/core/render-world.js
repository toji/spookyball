import { World } from './ecs.js';

import { InputSystem } from './input.js';
import { EntityGroupSystem } from './entity-group.js';
import { AnimationSystem } from './animation.js';
import { MeshSystem } from './mesh.js';
import { SkinSystem } from './skin.js';
import { SkyboxSystem } from './skybox.js';
import { LightSystem } from './light.js';

export class Renderer {
  #renderMeshInstances = new Map();

  maxLightCount = 512;
  maxShadowCasters = 64;

  get textureLoader() {
    throw new Error('textureLoader getter must be overriden in an extended class.');
  }

  createStaticBuffer(sizeOrArrayBuffer, usage = 'vertex') {
    throw new Error('createStaticBuffer must be overriden in an extended class.');
  }

  createDynamicBuffer(sizeOrArrayBuffer, usage = 'vertex') {
    throw new Error('createDynamicBuffer must be overriden in an extended class.');
  }

  clearFrameMeshInstances() {
    this.#renderMeshInstances.clear();
  }

  addFrameMeshInstance(mesh, transform, color) {
    let meshInstances = this.#renderMeshInstances.get(mesh);
    if (!meshInstances) {
      meshInstances = new Array();
      this.#renderMeshInstances.set(mesh, meshInstances);
    }
    meshInstances.push({ transform, color });
  }

  getFrameMeshInstances() {
    return this.#renderMeshInstances;
  }
}

export class RenderWorld extends World {
  #canvas;
  #renderer = null;
  #rendererInitialized;

  constructor(canvas, flags = {}) {
    super();

    this.#canvas = canvas || document.createElement('canvas');

    this.#rendererInitialized = this.intializeRenderer(flags).then((renderer) => {
      this.#renderer = renderer;
      return renderer;
    });

    this.registerSystem(InputSystem);
    this.registerSystem(EntityGroupSystem);
    this.registerSystem(AnimationSystem);
    this.registerSystem(MeshSystem);
    this.registerSystem(SkinSystem);
    this.registerRenderSystem(LightSystem);
    this.registerRenderSystem(SkyboxSystem);
  }

  get canvas() {
    return this.#canvas;
  }

  execute(delta, time) {
    this.#renderer?.clearFrameMeshInstances();
    super.execute(delta, time, this.#renderer);
  }

  registerRenderSystem(systemType, ...initArgs) {
    this.#rendererInitialized.then((renderer) => {
      this.registerSystem(systemType, renderer, ...initArgs);
    });
    return this;
  }

  async intializeRenderer() {
    throw new Error('intializeRenderer must be overriden in an extended class.');
  }

  async renderer() {
    return await this.#rendererInitialized;
  }
}