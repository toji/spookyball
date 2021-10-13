import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { Transform } from '../core/transform.js';
import { ShadowFragmentSource,  } from './wgsl/shadow.js';
import { WebGPUCameraBase } from './webgpu-camera.js';

import { mat4, vec3, vec4 } from 'gl-matrix';
import { DirectionalLight, ShadowCastingLight } from '../core/light.js';

const tmpVec3 = vec3.create();

export class WebGPUShadowCamera extends WebGPUCameraBase {
  constructor(gpu, size) {
    super(gpu)
    const device = gpu.device;

    size *= gpu.flags.shadowResolutionMultiplier;

    this.outputSize[0] = size;
    this.outputSize[1] = size;

    // TODO: Allocate this dynamically from the larger texture
    this.viewport = [
      1, 1, size-2, size-2, 0.0, 1.0
    ];

    const dummyStorageBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE
    });

    const dummyShadowTexture = device.createTexture({
      size: [4, 4],
      usage: GPUTextureUsage.TEXTURE_BINDING,
      format: 'depth32float'
    });

    this.bindGroup = gpu.device.createBindGroup({
      layout: gpu.bindGroupLayouts.frame,
      entries: [{
        binding: 0,
        resource: { buffer: this.cameraBuffer, },
      }, {
        binding: 1,
        resource: { buffer: dummyStorageBuffer, },
      }, {
        binding: 2,
        resource: { buffer: dummyStorageBuffer, },
      }, {
        binding: 3,
        resource: gpu.defaultSampler
      }, {
        binding: 4,
        resource: dummyShadowTexture.createView()
      }, {
        binding: 5,
        resource: gpu.shadowDepthSampler
      }, {
        binding: 6,
        resource: { buffer: gpu.lightShadowTableBuffer, },
      }, {
        binding: 7,
        resource: { buffer: gpu.shadowPropertiesBuffer, },
      }],
    });
  }
}

export class WebGPUShadowSystem extends WebGPUSystem {
  stage = Stage.ShadowRender;

  #shadowPipelineCache = new WeakMap();
  frameCount = 0;

  init(gpu) {
    this.shadowCastingLightQuery = this.query(ShadowCastingLight);
    this.shadowCameraQuery = this.query(WebGPUShadowCamera);
    this.shadowUpdateFrequency = gpu.flags.shadowUpdateFrequency;
  }

  getOrCreateShadowPipeline(gpu, webgpuPipeline) {
    let shadowPipeline = this.#shadowPipelineCache.get(webgpuPipeline);
    if (!shadowPipeline) {
      shadowPipeline = this.createShadowPipeline(gpu, webgpuPipeline);
      this.#shadowPipelineCache.set(webgpuPipeline, shadowPipeline);
    }
    return shadowPipeline;
  }

  createShadowPipeline(gpu, webgpuPipeline) {
    return gpu.device.createRenderPipeline({
      label: `Shadow Pipeline For PipelineID: ${webgpuPipeline.pipelineId})`,
      layout: webgpuPipeline.pipelineLayout,
      vertex: webgpuPipeline.vertex,
      fragment: {
        module: gpu.device.createShaderModule({
          label: `Shadow Fragment shader module (Layout: ${webgpuPipeline.layout.id})`,
          code: ShadowFragmentSource(webgpuPipeline.layout)
        }),
        entryPoint: 'fragmentMain',
        targets: []
      },
      primitive: webgpuPipeline.layout.primitive,
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth32float',
      },
    });
  }

  execute(delta, time, gpu) {
    this.frameCount++;
    if (this.frameCount % gpu.flags.shadowUpdateFrequency != 0) {
      // Skip shadow updates this frame.
      return;
    }

    const lightShadowTable = new Int32Array(gpu.maxLightCount);
    lightShadowTable.fill(-1);

    let nextShadowIndex = 1;

    const shadowProperties = new Float32Array(gpu.maxShadowCasters * 20);

    let shadowIndex = 0;
    this.shadowCastingLightQuery.forEach((entity, shadowCaster) => {
      const directionalLight = entity.get(DirectionalLight);
      if (directionalLight) {
        const shadowIndex = 0; // Directional light is always shadow index 0
        const propertOffset = shadowIndex * 20 * Float32Array.BYTES_PER_ELEMENT;

        let shadowCamera = entity.get(WebGPUShadowCamera);
        if (!shadowCamera) {
          shadowCamera = new WebGPUShadowCamera(gpu, shadowCaster.textureSize);
          entity.add(shadowCamera);
        }

        // Update the shadow camera's properties
        const transform = entity.get(Transform);
        if (!transform) {
          throw new Error('Shadow casting directional lights must have a transform to indicate where the shadow map' +
            'originates. (Only the position will be considered.)');
        }

        transform.getWorldPosition(shadowCamera.position);
        vec3.sub(tmpVec3, shadowCamera.position, directionalLight.direction);
        mat4.lookAt(shadowCamera.view, shadowCamera.position, tmpVec3, shadowCaster.up);

        mat4.orthoZO(shadowCamera.projection,
          shadowCaster.width * -0.5, shadowCaster.width * 0.5,
          shadowCaster.height * -0.5, shadowCaster.height * 0.5,
          shadowCaster.zNear, shadowCaster.zFar);
        mat4.invert(shadowCamera.inverseProjection, shadowCamera.projection);

        shadowCamera.time[0] = time;
        shadowCamera.zRange[0] = shadowCaster.zNear;
        shadowCamera.zRange[1] = shadowCaster.zFar;

        gpu.device.queue.writeBuffer(shadowCamera.cameraBuffer, 0, shadowCamera.arrayBuffer);

        const shadowViewport = new Float32Array(shadowProperties.buffer, propertOffset, 4);
        const viewProjMat = new Float32Array(shadowProperties.buffer, propertOffset + 4 * Float32Array.BYTES_PER_ELEMENT, 16);

        vec4.scale(shadowViewport, shadowCamera.viewport, 1.0/gpu.shadowAtlasSize);
        mat4.multiply(viewProjMat, shadowCamera.projection, shadowCamera.view);

        lightShadowTable[0] = shadowIndex; // Directional light is always considered light 0
      }

      shadowIndex++;
    });

    
    // TODO: Do point/spot lights as well

    gpu.device.queue.writeBuffer(gpu.lightShadowTableBuffer, 0, lightShadowTable);
    gpu.device.queue.writeBuffer(gpu.shadowPropertiesBuffer, 0, shadowProperties);

    // TODO: Should be able to have a single command encoder for all render passes
    const commandEncoder = gpu.device.createCommandEncoder({});

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: gpu.shadowDepthTextureView,
        depthLoadValue: 1.0,
        depthStoreOp: 'store',
        stencilLoadValue: 0,
        stencilStoreOp: 'store',
      }
    });

    this.shadowCameraQuery.forEach((entity, shadowCamera) => {
      // Render a shadow pass

      // TODO: Set viewport into shadow texture
      passEncoder.setViewport(...shadowCamera.viewport);

      passEncoder.setBindGroup(0, shadowCamera.bindGroup);

      const instanceBuffer = gpu.renderBatch.instanceBuffer;

      // Loop through all the renderable entities and store them by pipeline.
      for (const pipeline of gpu.renderBatch.sortedPipelines) {
        if (!pipeline.layout) { continue; }

        const shadowPipeline = this.getOrCreateShadowPipeline(gpu, pipeline);

        passEncoder.setPipeline(shadowPipeline);

        const geometryList = gpu.renderBatch.pipelineGeometries.get(pipeline);
        for (const [geometry, materialList] of geometryList) {

          for (const vb of geometry.vertexBuffers) {
            passEncoder.setVertexBuffer(vb.slot, vb.buffer.gpuBuffer, vb.offset);
          }
          const ib = geometry.indexBuffer;
          if (ib) {
            passEncoder.setIndexBuffer(ib.buffer.gpuBuffer, ib.format, ib.offset);
          }

          for (const [material, instances] of materialList) {
            if (material) {
              if (!material.castsShadow) { continue; }

              let i = material.firstBindGroupIndex;
              for (const bindGroup of material.bindGroups) {
                passEncoder.setBindGroup(i++, bindGroup);
              }
            }

            if (pipeline.instanceSlot >= 0) {
              passEncoder.setVertexBuffer(pipeline.instanceSlot, instanceBuffer, instances.bufferOffset);
            }

            

            if (ib) {
              passEncoder.drawIndexed(geometry.drawCount, instances.instanceCount);
            } else {
              passEncoder.draw(geometry.drawCount, instances.instanceCount);
            }

            // Restore the camera binding if needed
            if (material?.firstBindGroupIndex == 0) {
              passEncoder.setBindGroup(0, camera.bindGroup);
            }
          }
        }
      }
    });

    passEncoder.endPass();

    gpu.device.queue.submit([commandEncoder.finish()]);
  }
}
