import { WebGPUMaterialFactory, WebGPUMaterialPipeline, WebGPUMaterialBindGroups, RenderOrder } from './webgpu-material-factory.js';

// It's necessary to include these material files to register their factories,
// though we don't need to import anything from them explicitly.
import './webgpu-pbr-material.js';
import './webgpu-unlit-material.js';
import './webgpu-skybox-material.js';

export { WebGPUMaterialFactory, WebGPUMaterialPipeline, WebGPUMaterialBindGroups, RenderOrder };
