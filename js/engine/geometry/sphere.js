import { Geometry, InterleavedAttributes } from '../core/mesh.js';
import { vec3 } from 'gl-matrix';

// Big swaths of this code lifted with love from Three.js
export class SphereGeometry extends Geometry {
  constructor(renderer, radius = 1, widthSegments = 32, heightSegments = 16 ) {
    const phiStart = 0;
    const phiLength = Math.PI * 2;
    const thetaStart = 0;
    const thetaLength = Math.PI;

    widthSegments = Math.max( 3, Math.floor( widthSegments ) );
    heightSegments = Math.max( 2, Math.floor( heightSegments ) );

    const thetaEnd = Math.min( thetaStart + thetaLength, Math.PI );

    let index = 0;
    const grid = [];

    const vertex = vec3.create();
    const normal = vec3.create();

    // buffers

    const vertices = [];
    const indices = [];

    // generate vertices, normals and uvs

    for (let iy = 0; iy <= heightSegments; ++iy) {
      const verticesRow = [];
      const v = iy / heightSegments;

      // special case for the poles
      let uOffset = 0;
      if (iy == 0 && thetaStart == 0) {
        uOffset = 0.5 / widthSegments;
      } else if (iy == heightSegments && thetaEnd == Math.PI) {
        uOffset = - 0.5 / widthSegments;
      }

      for (let ix = 0; ix <= widthSegments; ++ix) {
        const u = ix / widthSegments;

        // vertex
        vertex[0] = - radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        vertex[1] = radius * Math.cos(thetaStart + v * thetaLength);
        vertex[2] = radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);

        vertices.push(vertex[0], vertex[1], vertex[2]);

        // normal
        vec3.normalize(normal, vertex);
        vertices.push(normal[0], normal[1], normal[2]);

        // texcoord
        vertices.push(u + uOffset, 1 - v);

        verticesRow.push(index++);
      }

      grid.push(verticesRow);
    }

    // indices

    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0 || thetaStart > 0) indices.push(a, b, d);
        if (iy !== heightSegments - 1 || thetaEnd < Math.PI) indices.push(b, c, d);
      }
    }

    const vertBuffer = renderer.createStaticBuffer(new Float32Array(vertices));
    const attributes = new InterleavedAttributes(vertBuffer, 32)
      .addAttribute('position', 0)
      .addAttribute('normal', 12)
      .addAttribute('texcoord', 24);

    super({
      drawCount: indices.length,
      attributes: [attributes],
      indices: {
        buffer: renderer.createStaticBuffer(new Uint16Array(indices), 'index'),
        format: 'uint16',
      },
    });
  }
}
