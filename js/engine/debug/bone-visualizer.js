import { System } from '../core/ecs.js';
import { Stage } from '../core/stage.js';
import { Mesh, Geometry, Attribute } from '../core/mesh.js';
import { UnlitMaterial } from '../core/materials.js';

const BONE_VERTS = new Float32Array([
  1.0,  1.0, -1.1,
  1.1,  1.0,  1.0,
  1.0,  1.1,  1.0,
 -1.1,  1.0,  1.0,
  1.0, -1.1,  1.0,
  1.0,  1.0,  5.1,
]);

const BONE_INDICES = new Uint16Array([
 0, 1, 0, 2, 0, 3, 0, 4,
 1, 2, 2, 3, 3, 4, 4, 1,
 1, 5, 2, 5, 3, 5, 4, 5,
]);

export class BoneVisualizerSystem extends System {
  stage = Stage.PostFrameLogic;

  init(gpu) {
    const vertexBuffer = gpu.createStaticBuffer(BONE_VERTS, 'vertex');
    const indexBuffer = gpu.createStaticBuffer(BONE_INDICES, 'index');

    const geometry = new Geometry({
      drawCount: BONE_INDICES.length,
      attributes: [ new Attribute('position', vertexBuffer) ],
      indices: { buffer: indexBuffer, format: 'uint16' },
      topology: 'line-list'
    });

    const material = new UnlitMaterial();
    material.baseColorFactor[0] = 0.0;
    material.baseColorFactor[1] = 1.0;
    material.baseColorFactor[2] = 1.0;
    material.depthCompare = 'always';

    this.mesh = new Mesh({ geometry, material });
  }

  execute(delta, time, gpu) {
    this.query(Mesh).forEach((entity, mesh) => {
      if (mesh.skin) {
        for (const transform of mesh.skin.joints) {
          gpu.addFrameMeshInstance(this.mesh, transform);
        }
      }
    });
  }
}
