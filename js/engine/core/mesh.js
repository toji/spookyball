import { System } from './ecs.js';
import { Stage } from './stage.js';
import { Transform } from './transform.js';
import { InstanceColor } from './instance-color.js';

export const AttributeLocation = {
  position: 0,
  normal: 1,
  tangent: 2,
  texcoord: 3,
  texcoord2: 4,
  color: 5,
  joints: 6,
  weights: 7,
  maxAttributeLocation: 8,
};

const DefaultAttributeFormat = {
  position: 'float32x3',
  normal: 'float32x3',
  tangent: 'float32x3',
  texcoord: 'float32x2',
  texcoord2: 'float32x2',
  color: 'float32x4',
  joints: 'uint16x4',
  weights: 'float32x4',
};

const DefaultStride = {
  uint8x2: 2,
  uint8x4: 4,
  sint8x2: 2,
  sint8x4: 4,
  unorm8x2: 2,
  unorm8x4: 4,
  snorm8x2: 2,
  snorm8x4: 4,
  uint16x2: 4,
  uint16x4: 8,
  sint16x2: 4,
  sint16x4: 8,
  unorm16x2: 4,
  unorm16x4: 8,
  snorm16x2: 4,
  snorm16x4: 8,
  float16x2: 4,
  float16x4: 8,
  float32: 4,
  float32x2: 8,
  float32x3: 12,
  float32x4: 16,
  uint32: 4,
  uint32x2: 8,
  uint32x3: 12,
  uint32x4: 16,
  sint32: 4,
  sint32x2: 8,
  sint32x3: 12,
  sint32x4: 16,
};

class GeometryLayoutCache {
  #nextId = 1;
  #keyMap = new Map(); // Map of the given key to an ID
  #cache = new Map();  // Map of ID to cached resource

  getLayout(id) {
    return this.#cache.get(id);
  }

  createLayout(attribBuffers, topology, indexFormat = 'uint32') {
    const buffers = [];
    const locationsUsed = [];
    for (const buffer of attribBuffers) {
      const attributes = [];
      for (const attrib of buffer.attributes) {
        // Exact offset will be handled when setting the buffer.
        const offset = attrib.offset - buffer.minOffset
        attributes.push({
          shaderLocation: attrib.shaderLocation,
          format: attrib.format,
          offset,
        });
        locationsUsed.push(attrib.shaderLocation);
      }

      buffers.push({
        arrayStride: buffer.arrayStride,
        attributes
      });
    }

    const primitive = { topology };
    switch(topology) {
      case 'triangle-strip':
      case 'line-strip':
        primitive.stripIndexFormat = indexFormat;
    }

    const layout = {
      buffers,
      primitive,
    };

    layout.key = JSON.stringify(layout);
    layout.id = this.#keyMap.get(layout.key);
    layout.locationsUsed = locationsUsed;

    if (layout.id === undefined) {
      layout.id = this.#nextId++;
      this.#keyMap.set(layout.key, layout.id);
      this.#cache.set(layout.id, layout);
    }

    return layout;
  }
}

const LAYOUT_CACHE = new GeometryLayoutCache();

export class InterleavedAttributes {
  constructor(buffer, stride) {
    this.buffer = buffer;
    this.arrayStride = stride;
    this.attributes = [];
    this.minOffset = Number.MAX_SAFE_INTEGER;
    this.minShaderLocation = Number.MAX_SAFE_INTEGER;
  }

  addAttribute(attribute, offset = 0, format) {
    const shaderLocation = AttributeLocation[attribute];
    if (shaderLocation === undefined) {
      throw new Error(`Unable to determine shader location for ${attribute}.`);
    }
    if (format === undefined) {
      format = DefaultAttributeFormat[attribute];
      if (!format) {
        throw new Error(`Unable to determine attribute format for ${attribute}.`);
      }
    }
    this.minOffset = Math.min(this.minOffset, offset);
    this.minShaderLocation = Math.min(this.minShaderLocation, shaderLocation);
    this.attributes.push({attribute, shaderLocation, offset, format});
    return this;
  }
};

export class Attribute extends InterleavedAttributes {
  constructor(attribute, buffer, format, stride) {
    if (format === undefined) {
      format = DefaultAttributeFormat[attribute];
      if (!format) {
        throw new Error(`Unable to determine attribute format for ${attribute}.`);
      }
    }
    if (!stride) {
      stride = DefaultStride[format];
    }
    super(buffer, stride);
    super.addAttribute(attribute, 0, format);
  }

  addAttribute() {
    throw new Error('Cannot add attributes to a AttributeBuffer. Use InterleavedBuffer instead.');
  }
};

let nextGeometryId = 1;

export class Geometry {
  id = nextGeometryId++;
  vertexBuffers = [];
  indexBuffer = null;
  drawCount = 0;
  layoutId;

  constructor(options) {
    // Sort the buffers/attributes by shaderLocation to aid in pipeline deduplication.
    const attribBuffers = [];
    if (options.attributes) {
      for (const attribBuffer of options.attributes) {
        if (!attribBuffer.attributes.length) { continue; }
        attribBuffers.push(attribBuffer);
      }
      attribBuffers.sort((a, b) => a.minShaderLocation - b.minShaderLocation);
      let i = 0;
      for (const buffer of attribBuffers) {
        this.vertexBuffers.push({
          slot: i++,
          buffer: buffer.buffer,
          offset: buffer.minOffset
        });
        buffer.attributes.sort((a, b) => a.shaderLocation - b.shaderLocation);
      }
    }

    if (options.indices?.buffer) {
      this.indexBuffer = {
        buffer: options.indices.buffer,
        offset: options.indices.offset || 0,
        format: options.indices.format || 'uint32'
      };
    }

    const topology = options.topology || 'triangle-list';
    const layout = LAYOUT_CACHE.createLayout(attribBuffers, topology, this.indexBuffer?.format);
    this.layoutId = layout.id;

    this.drawCount = options.drawCount || 0;
    // TODO: If an explicit drawCount wasn't given, guess one from the given buffers.
  }

  get layout() {
    return LAYOUT_CACHE.getLayout(this.layoutId);
  }
}

// A mesh is a collection of geometry/material pairs. Only meshes should be used as components for
// an entity. (This allows entities to have multiple geometries, whereas otherwise they would only
// be able to have a single geometry and material, which would be limiting cases in which
// an object consisting of multiple parts need to function as a single entity.)
export class Mesh {
  name = ''; // Primarily for debugging.
  primitives = []; // Borrowing the term from glTF, but it's clunky.
  skin = null;
  boundingVolume = null; // Not required, but may be available in some cases.

  constructor(...primitives) {
    for (const primitive of primitives) {
      if (!primitive.geometry || !primitive.material) {
        throw new Error('Primitive specified for mesh that lacks geometry or material');
      }
    }
    this.primitives.push(...primitives);
  }
}

export class MeshSystem extends System {
  stage = Stage.PostFrameLogic;

  async init() {
    this.meshQuery = this.query(Mesh);
  }

  execute(delta, time, gpu) {
    // TODO: This would be a perfect place for some frustum culling, etc.
    this.meshQuery.forEach((entity, mesh) => {
      gpu.addFrameMeshInstance(mesh, entity.get(Transform), entity.get(InstanceColor));
    });
  }
}
