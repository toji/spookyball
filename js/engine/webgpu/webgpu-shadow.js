import { WebGPUSystem } from './webgpu-system.js';
import { Stage } from '../core/stage.js';
import { Transform } from '../core/transform.js';
import { DirectionalLight, PointLight, ShadowCastingLight } from '../core/light.js';
import { TextureAtlasAllocator } from '../util/texture-atlas-allocator.js';
import { ShadowFragmentSource,  } from './wgsl/shadow.js';
import { WebGPUCameraBase } from './webgpu-camera.js';

import { mat4, vec3, vec4 } from 'gl-matrix';

const tmpVec3 = vec3.create();
const lightPos = vec3.create();

// Given in OpenGL Order:
const pointShadowLookDirs = [
  vec3.fromValues(1, 0, 0), // POSITIVE_X
  vec3.fromValues(-1, 0, 0), // NEGATIVE_X
  vec3.fromValues(0, 1, 0), // POSITIVE_Y
  vec3.fromValues(0, -1, 0), // NEGATIVE_Y
  vec3.fromValues(0, 0, 1), // POSITIVE_Z
  vec3.fromValues(0, 0, -1), // NEGATIVE_Z
];

const pointShadowUpDirs = [
  vec3.fromValues(0, 1, 0),
  vec3.fromValues(0, 1, 0),
  vec3.fromValues(0, 0, -1),
  vec3.fromValues(0, 0, -1),
  vec3.fromValues(0, 1, 0),
  vec3.fromValues(0, 1, 0),
];

export class WebGPUShadowCamera extends WebGPUCameraBase {
  constructor(gpu, rect) {
    super(gpu)
    const device = gpu.device;

    this.updateRect(rect);

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

  updateRect(rect) {
    this.outputSize[0] = rect.width;
    this.outputSize[1] = rect.height;

    // Build a 1px border into the viewport so that we don't get blending artifacts.
    this.viewport = [
      rect.x+1, rect.y+1, rect.width-2, rect.height-2, 0.0, 1.0
    ];
  }
}

export class WebGPUShadowSystem extends WebGPUSystem {
  stage = Stage.ShadowRender;

  #shadowPipelineCache = new WeakMap();
  #shadowCameraCache = new WeakMap();
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
    // This is silly, but for the moment it shouldn't give us too much trouble.
    // TODO: Find a better way to track when texture atlas rects are no longer
    // in use.
    this.allocator = new TextureAtlasAllocator(gpu.shadowAtlasSize);

    this.frameCount++;
    if (this.frameCount % gpu.flags.shadowUpdateFrequency != 0) {
      // Skip shadow updates this frame.
      return;
    }

    const lightShadowTable = new Int32Array(gpu.maxLightCount);
    lightShadowTable.fill(-1);

    const shadowProperties = new Float32Array(gpu.maxShadowCasters * 20);

    const frameShadowCameras = [];

    let shadowIndex = 1;
    this.shadowCastingLightQuery.forEach((entity, shadowCaster) => {
      const directionalLight = entity.get(DirectionalLight);
      if (directionalLight) {
        let shadowCamera = this.#shadowCameraCache.get(directionalLight);
        const shadowMapSize = shadowCaster.textureSize * gpu.flags.shadowResolutionMultiplier;
        if (!shadowCamera) {
          const shadowAtlasRect = this.allocator.allocate(shadowMapSize);
          shadowCamera = new WebGPUShadowCamera(gpu, shadowAtlasRect);
          this.#shadowCameraCache.set(directionalLight, shadowCamera);
        } else {
          const shadowAtlasRect = this.allocator.allocate(shadowMapSize);
          shadowCamera.updateRect(shadowAtlasRect);
        }

        frameShadowCameras.push(shadowCamera);

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

        const propertyOffset = 0; // Directional light is always shadow index 0
        const shadowViewport = new Float32Array(shadowProperties.buffer, propertyOffset, 4);
        const viewProjMat = new Float32Array(shadowProperties.buffer, propertyOffset + 4 * Float32Array.BYTES_PER_ELEMENT, 16);

        vec4.scale(shadowViewport, shadowCamera.viewport, 1.0/gpu.shadowAtlasSize);
        mat4.multiply(viewProjMat, shadowCamera.projection, shadowCamera.view);

        lightShadowTable[0] = 0; // Directional light is always considered light 0
      }

      const pointLight = entity.get(PointLight);
      if (pointLight) {
        // Point lights are made up of 6 shadow cameras, one pointing down each axis.
        let shadowCameras = this.#shadowCameraCache.get(pointLight);

        const shadowMapSize = shadowCaster.textureSize * gpu.flags.shadowResolutionMultiplier;
        if (!shadowCameras) {
          shadowCameras = [];
          for (let i = 0; i < 6; ++i) {
            const shadowAtlasRect = this.allocator.allocate(shadowMapSize);
            shadowCameras.push(new WebGPUShadowCamera(gpu, shadowAtlasRect));
          }
          this.#shadowCameraCache.set(pointLight, shadowCameras);
        } else {
          for (let i = 0; i < 6; ++i) {
            const shadowAtlasRect = this.allocator.allocate(shadowMapSize);
            shadowCameras[i].updateRect(shadowAtlasRect);
          }
        }

        const transform = entity.get(Transform);
        if (transform) {
          transform.getWorldPosition(lightPos);
        } else {
          vec3.set(lightPos, 0, 0, 0);
        }

        for (let i = 0; i < 6; ++i) {
          const shadowCamera = shadowCameras[i];
          const lookDir = pointShadowLookDirs[i];

          vec3.copy(shadowCamera.position, lightPos);
          vec3.add(tmpVec3, shadowCamera.position, lookDir);
          mat4.lookAt(shadowCamera.view, shadowCamera.position, tmpVec3, pointShadowUpDirs[i]);

          // TODO: Can the far plane at least be derived from the light range?
          mat4.perspectiveZO(shadowCamera.projection, Math.PI * 0.5, 1, shadowCaster.zNear, shadowCaster.zFar);
          mat4.invert(shadowCamera.inverseProjection, shadowCamera.projection);

          shadowCamera.time[0] = time;
          shadowCamera.zRange[0] = shadowCaster.zNear;
          shadowCamera.zRange[1] = shadowCaster.zFar;

          gpu.device.queue.writeBuffer(shadowCamera.cameraBuffer, 0, shadowCamera.arrayBuffer);

          const propertyOffset = (shadowIndex+i) * 20 * Float32Array.BYTES_PER_ELEMENT;
          const shadowViewport = new Float32Array(shadowProperties.buffer, propertyOffset, 4);
          const viewProjMat = new Float32Array(shadowProperties.buffer, propertyOffset + 4 * Float32Array.BYTES_PER_ELEMENT, 16);

          vec4.scale(shadowViewport, shadowCamera.viewport, 1.0/gpu.shadowAtlasSize);
          mat4.multiply(viewProjMat, shadowCamera.projection, shadowCamera.view);
        }

        frameShadowCameras.push(...shadowCameras);

        lightShadowTable[pointLight.lightIndex+1] = shadowIndex;
        shadowIndex+=6;
      }
    });

    if (!frameShadowCameras.length) { return; }

    // TODO: Do spot lights as well

    gpu.device.queue.writeBuffer(gpu.lightShadowTableBuffer, 0, lightShadowTable);
    gpu.device.queue.writeBuffer(gpu.shadowPropertiesBuffer, 0, shadowProperties);

    // TODO: Should be able to have a single command encoder for all render passes
    const commandEncoder = gpu.device.createCommandEncoder({});

    commandEncoder.pushDebugGroup('Render Shadows');

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: gpu.shadowDepthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      }
    });

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

            if (material.firstBindGroupIndex == 0) { continue; }

            let i = material.firstBindGroupIndex;
            for (const bindGroup of material.bindGroups) {
              passEncoder.setBindGroup(i++, bindGroup);
            }
          }

          if (pipeline.instanceSlot >= 0) {
            passEncoder.setVertexBuffer(pipeline.instanceSlot, instanceBuffer, instances.bufferOffset);
          }

          // Because we're rendering all the shadows into a single atlas it's more efficient to
          // bind then render once for each light's viewport.
          for (const shadowCamera of frameShadowCameras) {
            // Render a shadow pass
            passEncoder.setViewport(...shadowCamera.viewport);
            passEncoder.setBindGroup(0, shadowCamera.bindGroup);

            if (ib) {
              passEncoder.drawIndexed(geometry.drawCount, instances.instanceCount);
            } else {
              passEncoder.draw(geometry.drawCount, instances.instanceCount);
            }
          }

          // Restore the camera binding if needed
          /*if (material?.firstBindGroupIndex == 0) {
            passEncoder.setBindGroup(0, camera.bindGroup);
          }*/
        }
      }
    }

    passEncoder.end();

    commandEncoder.popDebugGroup();

    gpu.device.queue.submit([commandEncoder.finish()]);
  }
}
