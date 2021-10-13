import { StaticBuffer, DynamicBuffer } from '../core/buffers.js';

export class WebGPUStaticBuffer extends StaticBuffer {
  #arrayBuffer;

  constructor(device, gpuBuffer, size, usage, mapped = false) {
    super(size, usage);

    this.gpuBuffer = gpuBuffer;

    if (mapped) {
      // Static buffers are expected to be created with mappedAtCreation.
      this.#arrayBuffer = gpuBuffer.getMappedRange();
    }
  }

  get arrayBuffer() {
    return this.#arrayBuffer;
  }

  // For static buffers, once you call finish() the data cannot be updated again.
  finish() {
    this.gpuBuffer.unmap();
    this.#arrayBuffer = null;
  }
}

export class WebGPUDynamicBuffer extends DynamicBuffer {
  #device;
  #arrayBuffer;
  #size;
  #activeStagingBuffer;
  #stagingBufferQueue = [];

  constructor(device, gpuBuffer, size, usage, mapped = false) {
    super(size, usage);

    this.#device = device;
    this.#size = size;
    this.gpuBuffer = gpuBuffer;
    this.#activeStagingBuffer = gpuBuffer;

    if (mapped) {
      // Static buffers are expected to be created with mappedAtCreation.
      this.#arrayBuffer = gpuBuffer.getMappedRange();
    }
  }

  #getOrCreateStagingBuffer() {
    if (this.#stagingBufferQueue.length) {
      return this.#stagingBufferQueue.pop();
    }

    return this.#device.createBuffer({
      size: this.#size,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
      mappedAtCreation: true,
    });
  }

  get arrayBuffer() {
    return this.#arrayBuffer;
  }

  beginUpdate() {
    this.#activeStagingBuffer = this.#getOrCreateStagingBuffer();
    this.#arrayBuffer = this.#activeStagingBuffer.getMappedRange();
  }

  // For static buffers, once you call finish() the data cannot be updated again.
  finish() {
    this.#activeStagingBuffer.unmap();
    this.#arrayBuffer = null;

    if (this.#activeStagingBuffer !== this.gpuBuffer) {
      const stagingBuffer = this.#activeStagingBuffer;
      const commandEncoder = this.#device.createCommandEncoder({});
      commandEncoder.copyBufferToBuffer(stagingBuffer, 0, this.gpuBuffer, 0, this.#size);
      this.#device.queue.submit([commandEncoder.finish()]);

      stagingBuffer.mapAsync(GPUMapMode.WRITE).then(() => {
        this.#stagingBufferQueue.push(stagingBuffer);
      });
    }
    this.#activeStagingBuffer = null;
  }
}

function toGPUBufferUsage(usage) {
  switch (usage) {
    case 'vertex':
      return GPUBufferUsage.VERTEX;
    case 'index':
      return GPUBufferUsage.INDEX;
    case 'joint':
    case 'light':
      return GPUBufferUsage.STORAGE;
    default:
      throw new Error(`Unknown Buffer usage '${usage}'`);
  }
}

export class WebGPUBufferManager {
  constructor(device) {
    this.device = device;
  }

  createBufferInternal(constructor, sizeOrArrayBuffer, usage) {
    let size;
    let arrayBufferView = null;
    if (typeof sizeOrArrayBuffer === 'number') {
      size = sizeOrArrayBuffer;
    } else {
      size = sizeOrArrayBuffer.byteLength;
      arrayBufferView = sizeOrArrayBuffer;
      if (!ArrayBuffer.isView(arrayBufferView)) {
        arrayBufferView = new Uint8Array(arrayBufferView);
      }
    }

    // Align the size to the next multiple of 4
    size =  Math.ceil(size / 4) * 4;

    const gpuBuffer = this.device.createBuffer({
      size,
      usage,
      mappedAtCreation: true,
    });
    const buffer = new constructor(this.device, gpuBuffer, size, usage, true);

    // If an ArrayBuffer or TypedArray was passed in, initialize the GPUBuffer
    // with it's data. Otherwise we'll leave it mapped for the used to populate.
    if (arrayBufferView) {
      const typedArray = new arrayBufferView.constructor(buffer.arrayBuffer);
      typedArray.set(arrayBufferView);
      buffer.finish();
    }

    return buffer;
  }

  createStaticBuffer(sizeOrArrayBuffer, usage) {
    return this.createBufferInternal(WebGPUStaticBuffer, sizeOrArrayBuffer, toGPUBufferUsage(usage));
  }

  createDynamicBuffer(sizeOrArrayBuffer, usage) {
    return this.createBufferInternal(WebGPUDynamicBuffer, sizeOrArrayBuffer, toGPUBufferUsage(usage) | GPUBufferUsage.COPY_DST);
  }
}