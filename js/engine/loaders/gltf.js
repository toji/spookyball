import { Gltf2Loader } from './lib/gltf2-loader.js';
import { Transform, TransformPool } from '../core/transform.js';
import { EntityGroup } from '../core/entity-group.js';
import { Mesh, Geometry, InterleavedAttributes } from '../core/mesh.js';
import { BoundingVolume } from '../core/bounding-volume.js';
import { UnlitMaterial, PBRMaterial } from '../core/materials.js';
import { mat4, vec3 } from 'gl-matrix';
import { Skin } from '../core/skin.js';
import {
  LinearAnimationSampler,
  SphericalLinearAnimationSampler,
  StepAnimationSampler,
  AnimationChannel,
  Animation
} from '../core/animation.js';

// Used for comparing values from glTF files, which uses WebGL enums natively.
const GL = WebGLRenderingContext;

const AttribMap = {
  POSITION: 'position',
  NORMAL: 'normal',
  TANGENT: 'tangent',
  TEXCOORD_0: 'texcoord',
  TEXCOORD_1: 'texcoord2',
  COLOR_0: 'color',
  JOINTS_0: 'joints',
  WEIGHTS_0: 'weights',
};

class GltfClient {
  constructor(gpu) {
    this.gpu = gpu;
  }

  preprocessJson(json) {
    // Allocate storage for all the node transforms ahead of time.
    json.transformPool = new TransformPool(json.nodes.length);
    for (let i = 0; i < json.nodes.length; ++i) {
      json.nodes[i].transform = json.transformPool.getTransform(i);
    }
    return json;
  }

  createSampler(sampler) {
    function wrapToAddressMode(wrap) {
      switch (wrap) {
        case GL.CLAMP_TO_EDGE: return 'clamp-to-edge';
        case GL.MIRRORED_REPEAT: return 'mirror-repeat';
        default: return 'repeat';
      }
    }

    const descriptor = {
      addressModeU: wrapToAddressMode(sampler.wrapS),
      addressModeV: wrapToAddressMode(sampler.wrapT),
    };

    if (!sampler.magFilter || sampler.magFilter == GL.LINEAR) {
      descriptor.magFilter = 'linear';
    }

    switch (sampler.minFilter) {
      case GL.LINEAR:
      case GL.LINEAR_MIPMAP_NEAREST:
        descriptor.minFilter = 'linear';
        break;
      case GL.NEAREST_MIPMAP_LINEAR:
        descriptor.mipmapFilter = 'linear';
        break;
      case GL.LINEAR_MIPMAP_LINEAR:
      default:
        descriptor.minFilter = 'linear';
        descriptor.mipmapFilter = 'linear';
        break;
    }

    return this.gpu.device.createSampler(descriptor);
  }

  async createImage(image) {
    const result = await this.gpu.textureLoader.fromBlob(image.blob, {colorSpace: image.colorSpace});
    return result.texture.createView();
  }

  createVertexBuffer(bufferView) {
    const typedArray = new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
    return this.gpu.createStaticBuffer(typedArray, 'vertex');
  }

  createIndexBuffer(bufferView) {
    const typedArray = new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
    return this.gpu.createStaticBuffer(typedArray, 'index');
  }

  createInverseBindMatrixBuffer(bufferView) {
    const typedArray = new Uint8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
    return this.gpu.createStaticBuffer(typedArray, 'joint');
  }

  createMaterial(material) {
    let out;
    if (material.extensions?.KHR_materials_pbrSpecularGlossiness) {
      const specularGloss = material.extensions.KHR_materials_pbrSpecularGlossiness;

      // TODO: This isn't correct
      out = new PBRMaterial();
      out.baseColorFactor = specularGloss.diffuseFactor;
      out.baseColorTexture = specularGloss.diffuseTexture?.texture.image;
      out.baseColorSampler = specularGloss.diffuseTexture?.texture.sampler;

      //out.specularFactor = specularGloss.specularFactor;
      //out.glossFactor = specularGloss.glossinessFactor;
      //out.specularGlossTexture = specularGloss.specularGlossinessTexture?.texture.image;
      //out.specularGlossSampler = specularGloss.specularGlossinessTexture?.texture.sampler;
    } else {
      if (material.extensions?.KHR_materials_unlit) {
        out = new UnlitMaterial();
      } else {
        out = new PBRMaterial();
        out.metallicRoughnessTexture = material.pbrMetallicRoughness.metallicRoughnessTexture?.texture.image;
        out.metallicRoughnessSampler = material.pbrMetallicRoughness.metallicRoughnessTexture?.texture.sampler;
        out.metallicFactor = material.pbrMetallicRoughness.metallicFactor;
        out.roughnessFactor = material.pbrMetallicRoughness.roughnessFactor;
        out.normalTexture = material.normalTexture?.texture.image;
        out.normalSampler = material.normalTexture?.texture.sampler;
        out.occlusionTexture = material.occlusionTexture?.texture.image;
        out.occlusionSampler = material.occlusionTexture?.texture.sampler;
        out.occlusionStrength = material.occlusionTexture?.strength || 1.0;
        out.emissiveTexture = material.emissiveTexture?.texture.image;
        out.emissiveSampler = material.emissiveTexture?.texture.sampler;
        out.emissiveFactor = material.emissiveFactor;
      }

      out.baseColorFactor = material.pbrMetallicRoughness.baseColorFactor;
      out.baseColorTexture = material.pbrMetallicRoughness.baseColorTexture?.texture.image;
      out.baseColorSampler = material.pbrMetallicRoughness.baseColorTexture?.texture.sampler;
    }

    // Common fields between unlit and PBR materials
    out.doubleSided = material.doubleSided;
    switch (material.alphaMode) {
      case 'BLEND':
        out.transparent = true;
        out.alphaCutoff = 0.05;
        break;
      case 'MASK':
        out.alphaCutoff = material.alphaCutoff;
        break;
    }

    return out;
  }

  createPrimitive(primitive) {
    const min = vec3.create();
    const max = vec3.create();
    let drawCount = 0;
    const attribBuffers = new Map();
    for (const name in primitive.attributes) {
      const accessor = primitive.attributes[name];
      let attribBuffer = attribBuffers.get(accessor.bufferViewIndex);
      if (!attribBuffer) {
        attribBuffer = new InterleavedAttributes(accessor.clientVertexBuffer, accessor.bufferView.byteStride);
        attribBuffers.set(accessor.bufferViewIndex, attribBuffer);
        drawCount = accessor.count;
      } else if (Math.abs(accessor.byteOffset - attribBuffer.minOffset) > 2048 ||
                 Math.abs(accessor.byteOffset - attribBuffer.minOffset) >= accessor.bufferView.byteStride) {
        // In some cases the buffer used will be the same but the data won't actually be interleaved.
        // (ie: The attributes are placed in sequential blocks in the same buffer.) In case that
        // happens, defined it as if it were a separate buffer to avoid WebGPU limits on maximum
        // attribute offsets.
        attribBuffer = new InterleavedAttributes(accessor.clientVertexBuffer, accessor.bufferView.byteStride);
        attribBuffers.set(-attribBuffers.size, attribBuffer);
      }

      const attribName = AttribMap[name];
      if (attribName) {
        attribBuffer.addAttribute(AttribMap[name], accessor.byteOffset, accessor.gpuFormat);
      } else {
        console.log(`glTF contained unsupported attribute name: ${name}`);
      }

      if (name == "POSITION") {
        vec3.copy(min, accessor.min);
        vec3.copy(max, accessor.max);
      }
    }

    const geometryDescriptor = {
      drawCount: primitive.indices?.count || drawCount,
      attributes: attribBuffers.values(),
    };

    switch (primitive.mode) {
      case GL.TRIANGLES:
        geometryDescriptor.topology = 'triangle-list'; break;
      case GL.TRIANGLE_STRIP:
        geometryDescriptor.topology = 'triangle-strip'; break;
      case GL.LINES:
        geometryDescriptor.topology = 'line-list'; break;
      case GL.LINE_STRIP:
        geometryDescriptor.topology = 'line-strip'; break;
      case GL.POINTS:
        geometryDescriptor.topology = 'point-list'; break;
    }

    if (primitive.indices) {
      geometryDescriptor.indices = {
        buffer: primitive.indices.clientIndexBuffer,
        offset: primitive.indices.byteOffset,
      };
      switch (primitive.indices.componentType) {
        case GL.UNSIGNED_SHORT:
          geometryDescriptor.indices.format = 'uint16'; break;
        case GL.UNSIGNED_INT:
          geometryDescriptor.indices.format = 'uint32'; break;
      }
    }

    return {
      geometry: new Geometry(geometryDescriptor),
      material: primitive.material,
      min,
      max
    };
  }

  createMesh(mesh) {
    const outMesh = new Mesh(...mesh.primitives);
    outMesh.name = mesh.name;

    let min, max;

    for (const primitive of mesh.primitives) {
      if (min) {
        vec3.min(min, min, primitive.min);
        vec3.max(max, max, primitive.max);
      } else {
        min = vec3.clone(primitive.min);
        max = vec3.clone(primitive.max);
      }
    }

    if (min) {
      outMesh.boundingVolume = new BoundingVolume({ min, max });
    }

    return outMesh;
  }

  createAnimationChannel(channel) {
    let path;
    switch(channel.target.path) {
      case 'translation': path = 'position'; break;
      case 'rotation': path = 'orientation'; break;
      case 'scale': path = 'scale'; break;
      default: return null; // morph targets aren't supported.
    }

    let samplerType;
    switch(channel.sampler.interpolation) {
      case 'STEP': samplerType = StepAnimationSampler; break;
      case 'CUBICSPLINE ': // TODO
      case 'LINEAR': {
        if (channel.target.path == 'rotation') {
          samplerType = SphericalLinearAnimationSampler; break;
        } else {
          samplerType = LinearAnimationSampler; break;
        }
      }
      default: return null;
    }

    const sampler = new samplerType(
      channel.sampler.input.typedArray,
      channel.sampler.output.typedArray,
      channel.sampler.output.componentCount
    );

    return new AnimationChannel(channel.target.node, path, sampler);
  }

  createAnimation(animation) {
    return new Animation(animation.name, animation.channels);
  }

  createNode(node, index) {
    node.index = index;

    if (node.matrix) {
      node.transform.setLocalMatrix(node.matrix);
    } else {
      if (node.translation) { node.transform.position = node.translation; }
      if (node.rotation) { node.transform.orientation = node.rotation; }
      if (node.scale) { node.transform.scale = node.scale; }
    }

    return node;
  }

  preprocessResult(result, json) {
    result.transformPool = json.transformPool;
    return result;
  }
}

export class GltfScene {
  scene;
  nodes;
  nodeTransforms;
  meshes;
  materials;
  animations;
  boundingVolume;

  #createNodeInstance(nodeIndex, world, transforms, group) {
    const node = this.nodes[nodeIndex];
    const transform = transforms.getTransform(nodeIndex);

    if (node.mesh) {
      let mesh = node.mesh;
      let boundingVolume = mesh.boundingVolume;
      if (node.skin) {
        const joints = [];
        for (const jointIndex of node.skin.joints) {
          joints.push(transforms.getTransform(jointIndex));
        }
        mesh = new Mesh(...mesh.primitives);
        mesh.boundingVolume = boundingVolume;
        mesh.skin = new Skin({
          joints,
          inverseBindMatrixBuffer: node.skin.inverseBindMatrices.clientInverseBindMatrixBuffer,
          inverseBindMatrixOffset: node.skin.inverseBindMatrices.byteOffset
        });
      }

      const nodeEntity = world.create(transform, mesh, boundingVolume);
      nodeEntity.name = node.name;
      group.entities.push(nodeEntity);
    }

    if (node.children) {
      for (const child of node.children) {
        transform.addChild(transforms.getTransform(child));
        this.#createNodeInstance(child, world, transforms, group);
      }
    }
  }

  addInstanceToEntity(world, entity) {
    const group = new EntityGroup();
    const instanceTransforms = this.nodeTransforms.clone();
    let sceneTransform = entity.get(Transform);
    if (!sceneTransform) {
      sceneTransform = new Transform();
      entity.add(sceneTransform);
    }
    for (const nodeIndex of this.scene.nodes) {
      this.#createNodeInstance(nodeIndex, world, instanceTransforms, group);
      sceneTransform.addChild(instanceTransforms.getTransform(nodeIndex));
    }
    entity.add(sceneTransform, instanceTransforms, this.boundingVolume, group);
    return entity;
  }

  createInstance(world) {
    const entity = world.create();
    return this.addInstanceToEntity(world, entity);
  }

  getMeshByName(name) {
    for (const mesh of this.meshes) {
      if (mesh.name == name) {
        return mesh;
      }
    }
    return null;
  }
}

export class GltfLoader {
  #loader;

  constructor(gpu) {
    this.#loader = new Gltf2Loader(new GltfClient(gpu));
  }

  fromUrl(url) {
    return this.#loader.loadFromUrl(url).then(result => {
      const gltfScene = new GltfScene();
      gltfScene.scene = result.scene;
      gltfScene.nodes = result.nodes;
      gltfScene.nodeTransforms = result.transformPool;
      gltfScene.meshes = result.meshes;
      gltfScene.materials = result.materials;

      gltfScene.animations = {};
      for (const animation of result.animations) {
        gltfScene.animations[animation.name] = animation;
      }

      // Generate a bounding volume for the entire scene.
      let min;
      let max;

      for (const node of result.nodes) {
        if (!node.mesh?.boundingVolume) { continue; }

        // TODO: Take into account geometry transforms.
        if (min) {
          vec3.min(min, min, node.mesh.boundingVolume.min);
          vec3.max(max, max, node.mesh.boundingVolume.max);
        } else {
          min = vec3.clone(node.mesh.boundingVolume.min);
          max = vec3.clone(node.mesh.boundingVolume.max);
        }
      }

      if (min) {
        gltfScene.boundingVolume = new BoundingVolume({ min, max });
      }

      return gltfScene;
    });
  }

  instanceFromUrl(world, url) {
    const entity = world.create(new Transform());
    const scene = this.fromUrl(url).then((scene) => {
      scene.addInstanceToEntity(world, entity);
    });
    return entity;
  }
}