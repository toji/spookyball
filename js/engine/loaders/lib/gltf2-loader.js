const WORKER_DIR = import.meta.url.replace(/[^\/]*$/, '');

class DracoWorkerDecoder {
  nextId = 1;
  pendingDecodes = new Map();

  constructor() {
    this.worker = new Worker(`${WORKER_DIR}draco-worker.js`);
    this.worker.onmessage = (msg) => {
      const id = msg.data.id;
      const decodeRequest = this.pendingDecodes.get(id);
      if (!decodeRequest) {
        console.error(`Got a draco decode result for unknown request ${id}`);
        return;
      }

      if (msg.data.error) {
        decodeRequest.reject(new Error(msg.data.error));
        return;
      }

      decodeRequest.resolve(msg.data.buffersViews);
    };
  }

  decode(bufferView, attributes, indexSize) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;

      // Copy the buffer view so it can be transferred to the worker
      const buffer = new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength).slice().buffer;

      this.pendingDecodes.set(id, {resolve, reject});
      this.worker.postMessage({
        id,
        buffer,
        attributes,
        indexSize
      }, [buffer]);
    });
  }
}

// Used for comparing values from glTF files, which uses WebGL enums natively.
const GL = WebGLRenderingContext;

const GLB_MAGIC = 0x46546C67;
const CHUNK_TYPE = {
  JSON: 0x4E4F534A,
  BIN: 0x004E4942,
};

const absUriRegEx = new RegExp(`^${window.location.protocol}`, 'i');
const dataUriRegEx = /^data:/;
function resolveUri(uri, baseUrl) {
  if (!!uri.match(absUriRegEx) || !!uri.match(dataUriRegEx)) {
      return uri;
  }
  return baseUrl + uri;
}

function getComponentCount(type) {
  switch (type) {
    case 'SCALAR': return 1;
    case 'VEC2': return 2;
    case 'VEC3': return 3;
    case 'VEC4': return 4;
    default: return 0;
  }
}

function getComponentTypeSize(componentType) {
  switch (componentType) {
    case GL.BYTE: return 1;
    case GL.UNSIGNED_BYTE: return 1;
    case GL.SHORT: return 2;
    case GL.UNSIGNED_SHORT: return 2;
    case GL.UNSIGNED_INT: return 4;
    case GL.FLOAT: return 4;
    default: return 0;
  }
}

function getComponentTypeArrayConstructor(componentType) {
  switch (componentType) {
    case GL.BYTE: return Int8Array;
    case GL.UNSIGNED_BYTE: return Uint8Array;
    case GL.SHORT: return Int16Array;
    case GL.UNSIGNED_SHORT: return Uint16Array;
    case GL.UNSIGNED_INT: return Uint32Array;
    case GL.FLOAT: return Float32Array;
    default: throw new Error(`Unexpected componentType: ${componentType}`);
  }
}

function getAccessorGPUFormat(accessor) {
  const norm = accessor.normalized ? 'norm' : 'int';
  const count = getComponentCount(accessor.type);
  const x = count > 1 ? `x${count}` : '';
  switch (accessor.componentType) {
    case GL.BYTE: return `s${norm}8${x}`;
    case GL.UNSIGNED_BYTE: return `u${norm}8${x}`;
    case GL.SHORT: return `s${norm}16${x}`;
    case GL.UNSIGNED_SHORT: return `u${norm}16${x}`;
    case GL.UNSIGNED_INT: return `u${norm}32${x}`;
    case GL.FLOAT: return `float32${x}`;
  }
}

const DEFAULT_SAMPLER = {
  wrapS: GL.REPEAT,
  wrapT: GL.REPEAT
};

const DEFAULT_METALLIC_ROUGHNESS = {
  baseColorFactor: [1,1,1,1],
  metallicFactor: 1.0,
  roughnessFactor: 1.0,
};

const DEFAULT_SPECULAR_GLOSS = {
  diffuseFactor: [1,1,1,1],
  specularFactor: [1,1,1],
  glossinessFactor: 1.0,
};

const DEFAULT_MATERIAL = {
  pbrMetallicRoughness: DEFAULT_METALLIC_ROUGHNESS,
  emissiveFactor: [0,0,0],
  alphaMode: "OPAQUE",
  alphaCutoff: 0.5,
  doubleSided: false,
};

const DEFAULT_ACCESSOR = {
  byteOffset: 0,
  normalized: false,
};

const DEFAULT_LIGHT = {
  color: [1.0, 1.0, 1.0, 1.0],
  intensity: 1.0,
};

async function IDENTITY_FUNC(value) { return value; }
const CLIENT_PROXY_HANDLER = {
  get: function(target, key) {
    return key in target ? target[key] : IDENTITY_FUNC;
  }
};

/**
 * Gltf2Loader
 * Loads glTF 2.0 scenes into a more gpu-ready structure.
 */

export class Gltf2Loader {
  #client;
  #dracoDecoder;
  constructor(client) {
    // Doing this allows clients to omit methods that they don't care about.
    this.#client = new Proxy(client, CLIENT_PROXY_HANDLER);
  }

  async loadFromUrl(url) {
    const i = url.lastIndexOf('/');
    const baseUrl = (i !== 0) ? url.substring(0, i + 1) : '';
    const response = await fetch(url);

    if (url.endsWith('.gltf')) {
      return this.loadFromJson(await response.json(), baseUrl);
    } else if (url.endsWith('.glb')) {
      return this.loadFromBinary(await response.arrayBuffer(), baseUrl);
    } else {
      throw new Error('Unrecognized file extension');
    }
  }

  async loadFromBinary(arrayBuffer, baseUrl) {
    const headerView = new DataView(arrayBuffer, 0, 12);
    const magic = headerView.getUint32(0, true);
    const version = headerView.getUint32(4, true);
    const length = headerView.getUint32(8, true);

    if (magic != GLB_MAGIC) {
      throw new Error('Invalid magic string in binary header.');
    }

    if (version != 2) {
      throw new Error('Incompatible version in binary header.');
    }

    let chunks = {};
    let chunkOffset = 12;
    while (chunkOffset < length) {
      const chunkHeaderView = new DataView(arrayBuffer, chunkOffset, 8);
      const chunkLength = chunkHeaderView.getUint32(0, true);
      const chunkType = chunkHeaderView.getUint32(4, true);
      chunks[chunkType] = arrayBuffer.slice(chunkOffset + 8, chunkOffset + 8 + chunkLength);
      chunkOffset += chunkLength + 8;
    }

    if (!chunks[CHUNK_TYPE.JSON]) {
      throw new Error('File contained no json chunk.');
    }

    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(chunks[CHUNK_TYPE.JSON]);
    return this.loadFromJson(JSON.parse(jsonString), baseUrl, chunks[CHUNK_TYPE.BIN]);
  }

  async loadFromJson(json, baseUrl, binaryChunk) {
    const client = this.#client;

    // Give the client an opportunity to inspect and modify the json if they choose.
    json = await client.preprocessJson(json);

    if (!json.asset) {
      throw new Error('Missing asset description.');
    }

    if (json.asset.minVersion != '2.0' && json.asset.version != '2.0') {
      throw new Error('Incompatible asset version.');
    }

    if (!json.extensionsRequired) {
      json.extensionsRequired = [];
    }
    if (!json.extensionsUsed) {
      json.extensionsUsed = [];
    }

    // If we need draco decoding and we haven't yet created a decoder, do so now.
    let dracoDecoder = this.#dracoDecoder;
    if (!dracoDecoder && json.extensionsUsed.includes('KHR_draco_mesh_compression')) {
      dracoDecoder = this.#dracoDecoder = new DracoWorkerDecoder();
    }

    // TODO: Check extensions against supported set.

    // Buffers
    const clientBuffers = [];
    if (binaryChunk) {
      clientBuffers.push(Promise.resolve(binaryChunk));
    }
    async function resolveBuffer(index) {
      let clientBuffer = clientBuffers[index];
      if (!clientBuffer) {
        const buffer = json.buffers[index];
        const uri = resolveUri(buffer.uri, baseUrl);
        clientBuffer = fetch(uri).then(response => response.arrayBuffer());
        clientBuffers[index] = clientBuffer;
      }
      return clientBuffer;
    }

    // Buffer Views
    const clientBufferViews = [];
    async function resolveBufferView(index) {
      let clientBufferView = clientBufferViews[index];
      if (!clientBufferView) {
        const bufferView = json.bufferViews[index];
        // Set defaults.
        bufferView.byteOffset = bufferView.byteOffset || 0;
        clientBufferView = resolveBuffer(bufferView.buffer).then(buffer => {
          bufferView.buffer = buffer;
          return bufferView;
        });
        clientBufferViews[index] = clientBufferView;
      }
      return clientBufferView;
    }
    let nextBufferViewIndex = json.bufferViews.length;
    // Creates a buffer view compatible with the given accessor, in case it doesn't specify a valid
    // bufferView index. Also handles population of sparse values.
    function createSparseBufferView(accessor) {
      const index = nextBufferViewIndex++;
      const elementCount = getComponentCount(accessor.type);
      const byteStride = getComponentTypeSize(accessor.componentType) * elementCount;

      let bufferView;
      if (accessor.bufferView === undefined) {
        const byteLength = byteStride * accessor.count;
        const buffer = new ArrayBuffer(byteLength);

        bufferView = Promise.resolve({
          byteOffset: 0,
          byteStride,
          byteLength,
          buffer
        });
      } else {
        bufferView = resolveBufferView(accessor.bufferView).then((srcBufferView) => {
          // Make a copy of the bufferView data, since we'll be overwriting some of it.
          const copyBuffer = new Uint8Array(srcBufferView.byteLength);
          copyBuffer.set(new Uint8Array(srcBufferView.buffer, srcBufferView.byteOffset, srcBufferView.byteLength));

          return {
            byteOffset: 0,
            byteStride: srcBufferView.byteStride || byteStride,
            byteLength: srcBufferView.byteLength,
            buffer: copyBuffer.buffer
          };
        });
      }

      // If the accessor contains sparse data populate it into the buffer now.
      // TODO: Turns out this needs to apply to non-default accessors as well.
      const sparse = accessor.sparse;
      if (sparse) {
        clientBufferViews[index] = Promise.all([
          bufferView,
          resolveBufferView(sparse.indices.bufferView),
          resolveBufferView(sparse.values.bufferView)
        ]).then((bufferViews) => {
          const dstBufferView = bufferViews[0];
          const indexBufferView = bufferViews[1];
          const valueBufferView = bufferViews[2];

          const indexByteOffset = indexBufferView.byteOffset + (sparse.indices.byteOffset || 0);
          const indexArrayType = getComponentTypeArrayConstructor(sparse.indices.componentType);
          const indices = new indexArrayType(indexBufferView.buffer, indexByteOffset);

          const valueByteOffset = valueBufferView.byteOffset + (sparse.values.byteOffset || 0);
          const valueArrayType = getComponentTypeArrayConstructor(accessor.componentType);
          const srcValues = new valueArrayType(indexBufferView.buffer, valueByteOffset);
          const dstValues = new valueArrayType(dstBufferView.buffer);

          const elementStride = dstBufferView.byteStride / valueArrayType.BYTES_PER_ELEMENT;

          // Copy the sparse values into the newly created buffer
          for (let i = 0; i < sparse.count; ++i) {
            const dstIndex = indices[i] * elementStride;
            const srcIndex = i * elementCount;
            for (let j = 0; j < elementCount; ++j) {
              dstValues[dstIndex + j] = srcValues[srcIndex + j];
            }
          }

          return bufferView;
        });
      } else {
        clientBufferViews[index] = Promise.resolve(bufferView);
      }

      return { bufferViewIndex: index, clientBufferView: clientBufferViews[index] };
    }

    function createBufferViewFromTypedArray(typedArray, stride) {
      const index = nextBufferViewIndex++;
      clientBufferViews[index] = {
        byteOffset: typedArray.byteOffset,
        byteStride: stride,
        byteLength: typedArray.byteLength,
        buffer: typedArray.buffer
      };
      return index;
    }

    // Accessors
    const clientAccessors = [];
    const clientBufferTypeMap = new Map();
    function resolveAccessor(index, bufferType) {
      let clientAccessor = clientAccessors[index];
      if (!clientAccessor) {
        const accessor = Object.assign({}, DEFAULT_ACCESSOR, json.accessors[index]);

        // Resolve the bufferView if specified, otherwise create one that suits the accessor.
        let bufferViewPromise;
        if (accessor.bufferView == undefined || accessor.sparse) {
          const { bufferViewIndex, clientBufferView } = createSparseBufferView(accessor);
          accessor.bufferViewIndex = bufferViewIndex;
          bufferViewPromise = clientBufferView;
        } else {
          bufferViewPromise = resolveBufferView(accessor.bufferView);
          accessor.bufferViewIndex = accessor.bufferView;
        }

        clientAccessor = bufferViewPromise.then(async (bufferView) => {
          accessor.bufferView = bufferView;
          accessor.componentCount = getComponentCount(accessor.type);
          accessor.gpuFormat = getAccessorGPUFormat(accessor);
          const minimumByteStride = getComponentTypeSize(accessor.componentType) * accessor.componentCount;
          if (!bufferView.byteStride) {
            bufferView.byteStride = minimumByteStride;
          }

          if (bufferType) {
            let clientBufferTypes = clientBufferTypeMap[bufferType];
            if (!clientBufferTypes) {
              clientBufferTypes = [];
              clientBufferTypeMap[bufferType] = clientBufferTypes;
            }
            if (!clientBufferTypes[accessor.bufferViewIndex]) {
              clientBufferTypes[accessor.bufferViewIndex] = await client[`create${bufferType}`](bufferView, accessor.bufferViewIndex);
            }
            accessor[`client${bufferType}`] = clientBufferTypes[accessor.bufferViewIndex];
          } else {
            const typedArrayOffset = bufferView.byteOffset + accessor.byteOffset;
            const arrayType = getComponentTypeArrayConstructor(accessor.componentType);
            const elementCount = (minimumByteStride * accessor.count) / arrayType.BYTES_PER_ELEMENT;
            accessor.typedArray = new arrayType(bufferView.buffer, typedArrayOffset, elementCount);
          }

          return accessor;
        });
        clientAccessors[index] = clientAccessor;
      }
      return clientAccessor;
    }

    // Images
    const clientImages = [];
    function resolveImage(index, colorSpace) {
      let clientImage = clientImages[index];
      if (!clientImage) {
        const image = Object.assign({ colorSpace }, json.images[index]);
        if (image.uri) {
          clientImage = fetch(resolveUri(image.uri, baseUrl)).then(async (response) => {
            image.blob = await response.blob();
            return client.createImage(image, index);
          });
        } else {
          clientImage = resolveBufferView(image.bufferView).then(bufferView => {
            image.bufferView = bufferView;
            image.blob = new Blob(
                [new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength)],
                {type: image.mimeType});
            return client.createImage(image, index);
          });
        }
        clientImage[index] = clientImage;
      }
      return clientImage;
    }

    // Samplers
    let defaultSampler = null;
    const clientSamplers = [];
    function resolveSampler(index) {
      if (index === undefined) {
        if (!defaultSampler) {
          defaultSampler = client.createSampler(DEFAULT_SAMPLER, index);
        }
        return defaultSampler;
      }

      let clientSampler = clientSamplers[index];
      if (!clientSampler) {
        // Resolve any sampler defaults
        const sampler = Object.assign({}, DEFAULT_SAMPLER, json.samplers[index]);
        clientSampler = client.createSampler(sampler, index);
        clientSamplers[index] = clientSampler;
      }
      return clientSampler;
    }

    // Textures
    const clientTextures = [];
    function resolveTexture(index, colorSpace = 'linear') {
      let clientTexture = clientTextures[index];
      if (!clientTexture) {
        const texture = json.textures[index];
        let source = texture.source;
        const basisExt = texture.extensions?.KHR_texture_basisu
        if (basisExt) {
          source = basisExt.source;
        }
        clientTexture = resolveImage(source, colorSpace).then(async (clientImage) => {
          texture.image = clientImage;
          texture.sampler = await resolveSampler(texture.sampler);
          return client.createTexture(texture, index);
        });
        clientTextures[index] = clientTexture;
      }
      return clientTexture;
    }

    // Materials
    let defaultMaterial = null;
    const clientMaterials = [];
    function resolveMaterial(index) {
      if (index === undefined) {
        if (!defaultMaterial) {
          defaultMaterial = client.createMaterial(DEFAULT_MATERIAL);
        }
        return Promise.resolve(defaultMaterial);
      }

      let clientMaterial = clientMaterials[index];
      if (!clientMaterial) {
        const material = Object.assign({}, DEFAULT_MATERIAL, json.materials[index]);

        const texturePromises = [];

        if (material.extensions?.KHR_materials_pbrSpecularGlossiness) {
          material.extensions.KHR_materials_pbrSpecularGlossiness = Object.assign({}, DEFAULT_SPECULAR_GLOSS, material.extensions.KHR_materials_pbrSpecularGlossiness);
          const specularGloss = material.extensions.KHR_materials_pbrSpecularGlossiness;
          if (specularGloss.diffuseTexture) {
            texturePromises.push(
              resolveTexture(specularGloss.diffuseTexture.index, 'sRGB').then(texture => {
                specularGloss.diffuseTexture.texture = texture;
              }));
          }
          if (specularGloss.specularGlossinessTexture) {
            texturePromises.push(
              resolveTexture(specularGloss.specularGlossinessTexture.index, 'sRGB').then(texture => {
                specularGloss.specularGlossinessTexture.texture = texture;
              }));
          }
        }

        material.pbrMetallicRoughness = Object.assign({}, DEFAULT_METALLIC_ROUGHNESS, material.pbrMetallicRoughness);

        const pbr = material.pbrMetallicRoughness;
        if (pbr.baseColorTexture) {
          texturePromises.push(
            resolveTexture(pbr.baseColorTexture.index, 'sRGB').then(texture => {
              pbr.baseColorTexture.texture = texture;
            }));
        }
        if (pbr.metallicRoughnessTexture) {
          texturePromises.push(
            resolveTexture(pbr.metallicRoughnessTexture.index).then(texture => {
              pbr.metallicRoughnessTexture.texture = texture;
            }));
        }
        if (material.normalTexture) {
          texturePromises.push(
            resolveTexture(material.normalTexture.index).then(texture => {
              material.normalTexture.texture = texture;
            }));
        }
        if (material.occlusionTexture) {
          texturePromises.push(
            resolveTexture(material.occlusionTexture.index).then(texture => {
              material.occlusionTexture.texture = texture;
            }));
        }
        if (material.emissiveTexture) {
          texturePromises.push(
            resolveTexture(material.emissiveTexture.index, 'sRGB').then(texture => {
              material.emissiveTexture.texture = texture;
            }));
        }

        clientMaterial = Promise.all(texturePromises).then(() => {
          return client.createMaterial(material, index);
        });
        clientMaterials[index] = clientMaterial;
      }
      return clientMaterial;
    }

    // Primitives
    function resolvePrimitive(mesh, index) {
      const primitive = mesh.primitives[index];
      const primitivePromises = [];

      if (primitive.mode === undefined) {
        primitive.mode = GL.TRIANGLES;
      }

      const dracoExt = primitive.extensions?.KHR_draco_mesh_compression;
      let dracoPromise;
      if (dracoExt) {
        dracoPromise = resolveBufferView(dracoExt.bufferView).then(async bufferView => {
          let indexSize = 0;
          if ('indices' in primitive) {
            const indexAccessor = json.accessors[primitive.indices];
            indexSize = indexAccessor.componentType == GL.UNSIGNED_INT ? 4 : 2;
          }

          // Does the decode in a worker
          const decodedBufferViews = await dracoDecoder.decode(bufferView, dracoExt.attributes, indexSize);

          for (const name in dracoExt.attributes) {
            const bufferView = decodedBufferViews[name];
            const accessor = json.accessors[primitive.attributes[name]];
            accessor.bufferView = createBufferViewFromTypedArray(new Uint8Array(bufferView.buffer), bufferView.stride);
            accessor.byteOffset = 0;
          }

          if (indexSize) {
            const bufferView = decodedBufferViews.INDICES;
            const accessor = json.accessors[primitive.indices];
            accessor.bufferView = createBufferViewFromTypedArray(new Uint8Array(bufferView.buffer), bufferView.stride);
            accessor.byteOffset = 0;
          }
        });
      } else {
        dracoPromise = Promise.resolve();
      }

      primitivePromises.push(resolveMaterial(primitive.material).then(material => {
        primitive.material = material;
      }));

      primitivePromises.push(dracoPromise.then(() => {
        const attribPromises = [];
        for (const name in primitive.attributes) {
          // TODO: Handle accessors with no bufferView (initialized to 0);
          attribPromises.push(resolveAccessor(primitive.attributes[name], 'VertexBuffer').then(accessor => {
            primitive.attributes[name] = accessor;
          }));
        }

        if ('indices' in primitive) {
          attribPromises.push(resolveAccessor(primitive.indices, 'IndexBuffer').then(accessor => {
            primitive.indices = accessor;
          }));
        }
        return Promise.all(attribPromises);
      }));

      return Promise.all(primitivePromises).then(() => {
        return client.createPrimitive(primitive);
      });
    }

    // Meshes
    const clientMeshes = [];
    function resolveMesh(index) {
      let clientMesh = clientMeshes[index];
      if (!clientMesh) {
        const clientPrimitives = [];
        const mesh = json.meshes[index];
        for (const primitiveIndex in mesh.primitives) {
          clientPrimitives[primitiveIndex] = resolvePrimitive(mesh, primitiveIndex);
        }
        clientMesh = Promise.all(clientPrimitives).then(primitives => {
          mesh.primitives = primitives;
          return client.createMesh(mesh, index);
        });
        clientMeshes[index] = clientMesh;
      }
      return clientMesh;
    }

    // Skins
    const clientSkins = [];
    function resolveSkin(index) {
      let clientSkin = clientSkins[index];
      if (!clientSkin) {
        const skin = json.skins[index];
        const skinPromises = [];

        if ('skeleton' in skin) {
          skinPromises.push(resolveNode(skin.skeleton).then(skeleton => {
            skin.skeletonNode = skeleton;
          }));
        }

        const jointPromises = [];
        for (const joint of skin.joints) {
          jointPromises.push(resolveNode(joint));
        }
        skinPromises.push(Promise.all(jointPromises).then(joints => {
          skin.jointNodes = joints;
        }));

        if (!('inverseBindMatrices' in skin)) {
          // If inverseBindMatrices aren't provided, build a fake accesssor with a bufferView
          // initialized to identity matrices.
          const invBindMatricesBuffer = new Float32Array(16 * skin.joints.length);
          for (let i = 0; i < skin.joints.length; ++i) {
            mat4.identity(new Float32Array(invBindMatricesBuffer, 16 * i * Float32Array.BYTES_PER_ELEMENT, 16));
          }
          const bufferViewIndex = json.bufferViews.length;
          json.bufferViews.push({}); // Just a placeholder
          clientBufferViews[bufferViewIndex] = Promise.resolve({
            byteOffset: 0,
            byteStride: 16 * Float32Array.BYTES_PER_ELEMENT,
            buffer: invBindMatricesBuffer
          });

          skin.inverseBindMatrices = json.accessors.length;
          json.accessors[skin.inverseBindMatrices] = {
            bufferView: bufferViewIndex,
            byteOffset: 0,
            componentType: GL.FLOAT,
            type: 'MAT4',
            count: skin.joints.length
          };
        }

        skinPromises.push(resolveAccessor(skin.inverseBindMatrices, 'InverseBindMatrixBuffer').then(accessor => {
          skin.inverseBindMatrices = accessor;
        }));

        clientSkin = Promise.all(skinPromises).then(() => {
          return client.createSkin(skin, index);
        });
        clientSkins[index] = clientSkin;
      }
      return clientSkin;
    }

    // Animations
    const clientAnimations = [];
    function resolveAnimation(index) {
      let clientAnimation = clientAnimations[index];
      if (!clientAnimation) {
        const animation = json.animations[index];
        if (!animation.name) {
          animation.name = `animation_${index}`;
        }

        const samplerPromises = [];
        for (let i = 0; i < animation.samplers.length; ++i) {
          const sampler = animation.samplers[i];
          sampler.interpolation = sampler.interpolation || 'LINEAR';
          samplerPromises.push(Promise.all([
            resolveAccessor(sampler.input),
            resolveAccessor(sampler.output)
          ]).then(accessors => {
            sampler.input = accessors[0];
            sampler.output = accessors[1];
            return client.createAnimationSampler(sampler, i, index);
          }));
        }

        clientAnimation = Promise.all(samplerPromises).then(async clientSamplers => {
          const clientChannels = [];
          for (let i = 0; i < animation.channels.length; ++i) {
            const channel = animation.channels[i];
            channel.sampler = clientSamplers[channel.sampler];
            // TODO: Resolve node?
            if (channel.target.node === undefined) {
              clientChannels[i] = null;
            } else {
              clientChannels[i] = client.createAnimationChannel(channel, i, index);
            }
          }
          animation.channels = (await Promise.all(clientChannels)).filter((channel) => {
            return channel != null;
          });

          return client.createAnimation(animation, index);
        });
        clientAnimations[index] = clientAnimation;
      }
      return clientAnimation;
    }

    // Camera
    const clientCameras = [];
    function resolveCamera(index) {
      let clientCamera = clientCameras[index];
      if (!clientCamera) {
        const camera = json.cameras[index];
        clientCamera = client.createCamera(camera, index);
        clientCameras[index] = clientCamera;
      }
      return clientCamera;
    }

    // Extensions

    // Lights
    const KHR_lights_punctual = json.extensions?.KHR_lights_punctual;
    const clientLights = [];
    function resolveLight(index) {
      let clientLight = clientLights[index];
      if (!clientLight) {
        const light = Object.assign({}, DEFAULT_LIGHT, KHR_lights_punctual[index]);
        clientLight = client.createLight(light, index);
        clientLights[index] = clientLight;
      }
      return clientLight;
    }

    const clientNodes = [];
    function resolveNode(index) {
      let clientNode = clientNodes[index];
      if (!clientNode) {
        let node = json.nodes[index];
        const nodePromises = [];

        if ('mesh' in node) {
          nodePromises.push(resolveMesh(node.mesh).then(mesh => {
            node.mesh = mesh;
          }));
        }

        if ('camera' in node) {
          nodePromises.push(resolveCamera(node.camera).then(camera => {
            node.camera = camera;
          }));
        }

        if ('skin' in node) {
          nodePromises.push(resolveSkin(node.skin).then(skin => {
            node.skin = skin;
          }));
        }

        if (node.extensions?.KHR_lights_punctual) {
          nodePromises.push(resolveLight(node.extensions.KHR_lights_punctual.light).then(light => {
            node.light = light;
          }));
        }

        // Resolve any children of the node as well.
        const clientChildren = [];
        if ('children' in node) {
          for (const childIndex of node.children) {
            clientChildren.push(resolveNode(childIndex));
          }
        }

        clientNode = Promise.all(nodePromises).then(async () => {
          node.childNodes = await Promise.all(clientChildren);
          return client.createNode(node, index);
        });

        clientNodes[index] = clientNode;
      }
      return clientNode;
    }

    // Some things such as animations may access the entire node tree, whether or not it's part of a
    // given scene, so we'll result all of the nodes here first.
    for (let i = 0; i < json.nodes.length; ++i) {
      resolveNode(i);
    }

    if (json.animations) {
      for (let i = 0; i < json.animations.length; ++i) {
        resolveAnimation(i);
      }
    }

    // TODO: Load more than the default scene?
    //const scene = json.scenes[json.scene];
    /*scene.nodes = [];
    for (const nodeIndex of scene.nodes) {
      scene.nodes.push(nodes[nodeIndex]);
    }*/

    let result = {
      scene: json.scenes[json.scene],
      nodes: await Promise.all(clientNodes),
      meshes: await Promise.all(clientMeshes),
      materials: await Promise.all(clientMaterials),
      animations: await Promise.all(clientAnimations),
    };

    return await client.preprocessResult(result, json);
  }
}
