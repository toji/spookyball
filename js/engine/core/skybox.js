import { System } from './ecs.js';
import { Mesh, Geometry, Attribute } from './mesh.js';
import { Transform } from './transform.js';

export class SkyboxMaterial {
  constructor(texture = null) {
    this.texture = texture;
  }
}

export class Skybox {
  mesh;
  material;

  constructor(texture = null) {
    texture?.then((skyboxTexture) => {
      this.material = new SkyboxMaterial(skyboxTexture.texture);
    });
  }
}

const SKYBOX_VERTS = new Float32Array([
  1.0,  1.0,  1.0, // 0
 -1.0,  1.0,  1.0, // 1
  1.0, -1.0,  1.0, // 2
 -1.0, -1.0,  1.0, // 3
  1.0,  1.0, -1.0, // 4
 -1.0,  1.0, -1.0, // 5
  1.0, -1.0, -1.0, // 6
 -1.0, -1.0, -1.0, // 7
]);

const SKYBOX_INDICES = new Uint16Array([
  // PosX (Right)
  0, 2, 4,
  6, 4, 2,

  // NegX (Left)
  5, 3, 1,
  3, 5, 7,

  // PosY (Top)
  4, 1, 0,
  1, 4, 5,

  // NegY (Bottom)
  2, 3, 6,
  7, 6, 3,

  // PosZ (Front)
  0, 1, 2,
  3, 2, 1,

  // NegZ (Back)
  6, 5, 4,
  5, 6, 7,
]);

export class SkyboxSystem extends System {
  init(gpu) {
    const vertexBuffer = gpu.createStaticBuffer(SKYBOX_VERTS, 'vertex');
    const indexBuffer = gpu.createStaticBuffer(SKYBOX_INDICES, 'index');

    this.geometry = new Geometry({
      drawCount: 36,
      attributes: [ new Attribute('position', vertexBuffer) ],
      indices: { buffer: indexBuffer, format: 'uint16' }
    });

    this.skyboxQuery = this.query(Skybox);
  }

  execute(delta, time, gpu) {
    this.skyboxQuery.forEach((entity, skybox) => {
      if (!skybox.mesh && skybox.material) {
        skybox.mesh = new Mesh({
          geometry: this.geometry,
          material: skybox.material
        });
      }

      if (skybox.mesh) {
        gpu.addFrameMeshInstance(skybox.mesh, entity.get(Transform));
      }
    });
  }
}