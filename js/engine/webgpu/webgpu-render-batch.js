import { mat4 } from 'gl-matrix';
import { WebGPUMaterialBindGroups } from './materials/webgpu-material-factory.js';
import { INSTANCE_SIZE_BYTES, INSTANCE_SIZE_F32 } from './wgsl/common.js';

const IDENTITY_MATRIX = mat4.create();
const EMPTY_BIND_GROUP = new WebGPUMaterialBindGroups();
const DEFAULT_INSTANCE_COLOR = new Float32Array(4);

const INITIAL_INSTANCE_COUNT = 128;

export class WebGPURenderBatch {
  device;
  pipelineGeometries = new Map();
  #instanceCapacity;
  #instanceBuffer;
  #instanceArray;
  #instanceBufferDirty = true;
  #totalInstanceCount = 0;

  constructor(device) {
    this.device = device;
    this.resizeInstanceBuffer(INITIAL_INSTANCE_COUNT);
  }

  resizeInstanceBuffer(capacity) {
    if (this.#instanceBuffer) {
      this.#instanceBuffer.destroy();
    }

    this.#instanceBufferDirty = true;
    this.#instanceCapacity = capacity;
    this.#instanceArray = new Float32Array(INSTANCE_SIZE_F32 * capacity);
    this.#instanceBuffer = this.device.createBuffer({
      size: INSTANCE_SIZE_BYTES * capacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
  }

  clear() {
    this.pipelineGeometries = new Map();
    this.#totalInstanceCount = 0;
    this.#instanceBufferDirty = true;
  }

  addRenderable(geometry, pipeline, bindGroups = EMPTY_BIND_GROUP, instance = {}) {
    this.#instanceBufferDirty = true;
    let geometryMaterials = this.pipelineGeometries.get(pipeline);
    if (!geometryMaterials) {
      geometryMaterials = new Map();
      this.pipelineGeometries.set(pipeline, geometryMaterials);
    }
    let materialInstances = geometryMaterials.get(geometry);
    if (!materialInstances) {
      materialInstances = new Map();
      geometryMaterials.set(geometry, materialInstances);
    }
    let instances = materialInstances.get(bindGroups);
    if (!instances) {
      instances = {instanceCount: 0, transforms: [], colors: [], bufferOffset: 0};
      materialInstances.set(bindGroups, instances);
    }

    instances.instanceCount += instance.count || 1;
    instances.transforms.push(instance.transform?.worldMatrix || IDENTITY_MATRIX);
    instances.colors.push(instance.color?.buffer || DEFAULT_INSTANCE_COLOR);
    this.#totalInstanceCount += 1;
  }

  get instanceBuffer() {
    if (this.#instanceBufferDirty) {
      // Instance buffer needs to be resized to compensate for the total number of instances.
      if (this.#instanceCapacity < this.#totalInstanceCount) {
        this.resizeInstanceBuffer(this.#instanceCapacity * 2);
      }
      // TODO: Heuristic for resizing the instance buffer to be smaller?

      // Loop through all of the instances we're going to render and place their transforms in the
      // instances buffer.
      let instanceCount = 0;
      for (const geometryMaterials of this.pipelineGeometries.values()) {
        for (const materialInstances of geometryMaterials.values()) {
          for (const instances of materialInstances.values()) {
            instances.bufferOffset = instanceCount * INSTANCE_SIZE_BYTES;
            for (let i = 0; i < instances.transforms.length; ++i) {
              // TODO: Could just copy over the 4x3 portion of the matrix needed to represent a full
              // TRS transform. Copies would be slower, though.
              const arrayOffset = instanceCount * INSTANCE_SIZE_F32;
              this.#instanceArray.set(instances.transforms[i], arrayOffset);
              this.#instanceArray.set(instances.colors[i], arrayOffset + 16);
              instanceCount++;
            }
          }
        }
      }

      // Write the instance data out to the buffer.
      this.device.queue.writeBuffer(this.#instanceBuffer, 0, this.#instanceArray, 0, instanceCount * INSTANCE_SIZE_F32);
      this.#instanceBufferDirty = false;
    }
    return this.#instanceBuffer;
  }

  get sortedPipelines() {
    // Sort the pipelines by render order (e.g. so transparent objects are rendered last).
    const pipelines = Array.from(this.pipelineGeometries.keys())
    pipelines.sort((a, b) => a.renderOrder - b.renderOrder);
    return pipelines;
  }
}