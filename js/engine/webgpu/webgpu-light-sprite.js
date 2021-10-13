import { WebGPUSystem } from './webgpu-system.js';
import { Geometry } from '../core/mesh.js';
import { WebGPUMaterialPipeline, RenderOrder } from './materials/webgpu-materials.js';
import { LightBuffer } from '../core/light.js';
import { LightSpriteVertexSource, LightSpriteFragmentSource } from './wgsl/light-sprite.js';

export class WebGPULightSpriteSystem extends WebGPUSystem {
  init(gpu) {
    const vertexModule = gpu.device.createShaderModule({
      code: LightSpriteVertexSource,
      label: 'Light Sprite Vertex'
    });
    const fragmentModule = gpu.device.createShaderModule({
      code: LightSpriteFragmentSource,
      label: 'Light Sprite Fragment'
    });

    const fragmentTargets = [{
      format: gpu.renderTargets.format,
      blend: {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one',
        },
        alpha: {
          srcFactor: "one",
          dstFactor: "one",
        },
      },
    }]

    if (gpu.flags.bloomEnabled) {
      fragmentTargets.push({
        format: gpu.renderTargets.format,
        writeMask: 0,
      });
    }

    // Setup a render pipeline for drawing the light sprites
    const pipeline = gpu.device.createRenderPipeline({
      label: `Light Sprite Pipeline`,
      layout: gpu.device.createPipelineLayout({
        bindGroupLayouts: [
          gpu.bindGroupLayouts.frame,
        ]
      }),
      vertex: {
        module: vertexModule,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        targets: fragmentTargets,
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: 'uint32'
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: gpu.renderTargets.depthFormat,
      },
      multisample: {
        count: gpu.renderTargets.sampleCount,
      }
    });

    this.lightPipeline = new WebGPUMaterialPipeline({
      pipeline,
      renderOrder: RenderOrder.Last
    });
    this.lightGeometry = new Geometry({ drawCount: 4 });
  }

  execute(delta, time, gpu) {
    const lights = this.singleton.get(LightBuffer);
    gpu.renderBatch.addRenderable(this.lightGeometry, this.lightPipeline, undefined, { count: lights.lightCount });
  }
}