import { System } from '../core/ecs.js';
import { Stage } from '../core/stage.js';
import { Mesh, Geometry, Attribute } from '../core/mesh.js';
import { BoundingVolume, BoundingVolumeType } from '../core/bounding-volume.js';
import { UnlitMaterial } from '../core/materials.js';
import { Transform, StaticTransform } from '../core/transform.js';
import { vec3 } from 'gl-matrix';
import { create } from '../../../webxr-samples/js/third-party/gl-matrix/src/gl-matrix/mat2.js';

function createAABBMesh(gpu) {
  const boundsVerts = new Float32Array([
    1.0,  1.0,  1.0, // 0
    0.0,  1.0,  1.0, // 1
    1.0,  0.0,  1.0, // 2
    0.0,  0.0,  1.0, // 3
    1.0,  1.0,  0.0, // 4
    0.0,  1.0,  0.0, // 5
    1.0,  0.0,  0.0, // 6
    0.0,  0.0,  0.0, // 7
  ]);
  
  const boundsIndices = new Uint16Array([
    0, 1,  2, 3,  0, 2,  1, 3, // Front
    4, 5,  6, 7,  4, 6,  5, 7, // Back
    0, 4,  1, 5,  2, 6,  3, 7, // Corners
  ]);

  const vertexBuffer = gpu.createStaticBuffer(boundsVerts, 'vertex');
    const indexBuffer = gpu.createStaticBuffer(boundsIndices, 'index');

    const geometry = new Geometry({
      drawCount: boundsIndices.length,
      attributes: [ new Attribute('position', vertexBuffer) ],
      indices: { buffer: indexBuffer, format: 'uint16' },
      topology: 'line-list'
    });

    const material = new UnlitMaterial();
    material.baseColorFactor[0] = 1.0;
    material.baseColorFactor[1] = 1.0;
    material.baseColorFactor[2] = 0.0;
    material.depthCompare = 'always';

    const mesh = new Mesh({ geometry, material });
    mesh.name = 'Bounding Volume AABB Visualization Mesh';

    return mesh;
}

function createSphereMesh(gpu) {
  const ringSegments = 16;
  const colliderVerts = [];
  const colliderIndices = [];

  let idx = 0;
  for (let i = 0; i < ringSegments+1; ++i) {
    const u = (i / ringSegments) * Math.PI * 2;
    colliderVerts.push(Math.cos(u), 0, Math.sin(u));
    if (i > 0) { colliderIndices.push(idx, ++idx); }
  }

  idx++
  for (let i = 0; i < ringSegments+1; ++i) {
    const u = (i / ringSegments) * Math.PI * 2;
    colliderVerts.push(Math.cos(u), Math.sin(u), 0);
    if (i > 0) { colliderIndices.push(idx, ++idx); }
  }

  idx++
  for (let i = 0; i < ringSegments+1; ++i) {
    const u = (i / ringSegments) * Math.PI * 2;
    colliderVerts.push(0, Math.cos(u), Math.sin(u));
    if (i > 0) { colliderIndices.push(idx, ++idx); }
  }

  const vertexBuffer = gpu.createStaticBuffer(new Float32Array(colliderVerts), 'vertex');
  const indexBuffer = gpu.createStaticBuffer(new Uint16Array(colliderIndices), 'index');

  const geometry = new Geometry({
    drawCount: colliderIndices.length,
    attributes: [ new Attribute('position', vertexBuffer) ],
    indices: { buffer: indexBuffer, format: 'uint16' },
    topology: 'line-list'
  });

  const material = new UnlitMaterial();
  material.baseColorFactor[0] = 0.0;
  material.baseColorFactor[1] = 1.0;
  material.baseColorFactor[2] = 0.0;
  material.depthCompare = 'always';

  const mesh = new Mesh({ geometry, material });
  mesh.name = 'Bounding Volume Sphere Visualization Mesh';

  return mesh;
}

export class BoundsVisualizerSystem extends System {
  stage = Stage.PostFrameLogic;

  init(gpu) {
    this.aabbMesh = createAABBMesh(gpu);
    this.sphereMesh = createSphereMesh(gpu);
  }

  execute(delta, time, gpu) {
    const scale = vec3.create();

    this.query(BoundingVolume).forEach((entity, bounds) => {
      const transform = entity.get(Transform);

      switch(bounds.type) {
        case BoundingVolumeType.AABB:
          vec3.subtract(scale, bounds.max, bounds.min);

          gpu.addFrameMeshInstance(this.aabbMesh, new StaticTransform({
            position: bounds.min,
            scale
          }, transform?.worldMatrix));
          break;
        
        case BoundingVolumeType.Sphere:
          gpu.addFrameMeshInstance(this.sphereMesh, new StaticTransform({
            position: bounds.center,
            scale: [bounds.radius, bounds.radius, bounds.radius]
          }, transform?.worldMatrix));
          break;
      }
    });
  }
}
