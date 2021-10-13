import { Geometry, InterleavedAttributes } from '../core/mesh.js';

export class BoxGeometry extends Geometry {
  constructor(renderer, options = {}) {
    const w = (options.width || 1) * 0.5;
    const h = (options.height || 1) * 0.5;
    const d = (options.depth || 1) * 0.5;

    const x = options.x || 0;
    const y = options.y || 0;
    const z = options.z || 0;

    const cubeVerts = new Float32Array([
      //position,     normal,    uv,
      x+w, y-h, z+d,  0, -1, 0,  1, 1,
      x-w, y-h, z+d,  0, -1, 0,  0, 1,
      x-w, y-h, z-d,  0, -1, 0,  0, 0,
      x+w, y-h, z-d,  0, -1, 0,  1, 0,
      x+w, y-h, z+d,  0, -1, 0,  1, 1,
      x-w, y-h, z-d,  0, -1, 0,  0, 0,

      x+w, y+h, z+d,  1, 0, 0,   1, 1,
      x+w, y-h, z+d,  1, 0, 0,   0, 1,
      x+w, y-h, z-d,  1, 0, 0,   0, 0,
      x+w, y+h, z-d,  1, 0, 0,   1, 0,
      x+w, y+h, z+d,  1, 0, 0,   1, 1,
      x+w, y-h, z-d,  1, 0, 0,   0, 0,

      x-w, y+h, z+d,  0, 1, 0,   1, 1,
      x+w, y+h, z+d,  0, 1, 0,   0, 1,
      x+w, y+h, z-d,  0, 1, 0,   0, 0,
      x-w, y+h, z-d,  0, 1, 0,   1, 0,
      x-w, y+h, z+d,  0, 1, 0,   1, 1,
      x+w, y+h, z-d,  0, 1, 0,   0, 0,

      x-w, y-h, z+d,  -1, 0, 0,  1, 1,
      x-w, y+h, z+d,  -1, 0, 0,  0, 1,
      x-w, y+h, z-d,  -1, 0, 0,  0, 0,
      x-w, y-h, z-d,  -1, 0, 0,  1, 0,
      x-w, y-h, z+d,  -1, 0, 0,  1, 1,
      x-w, y+h, z-d,  -1, 0, 0,  0, 0,

      x+w, y+h, z+d,  0, 0, 1,   1, 1,
      x-w, y+h, z+d,  0, 0, 1,   0, 1,
      x-w, y-h, z+d,  0, 0, 1,   0, 0,
      x-w, y-h, z+d,  0, 0, 1,   0, 0,
      x+w, y-h, z+d,  0, 0, 1,   1, 0,
      x+w, y+h, z+d,  0, 0, 1,   1, 1,

      x+w, y-h, z-d,  0, 0, -1,  1, 1,
      x-w, y-h, z-d,  0, 0, -1,  0, 1,
      x-w, y+h, z-d,  0, 0, -1,  0, 0,
      x+w, y+h, z-d,  0, 0, -1,  1, 0,
      x+w, y-h, z-d,  0, 0, -1,  1, 1,
      x-w, y+h, z-d,  0, 0, -1,  0, 0,
    ]);

    const vertBuffer = renderer.createStaticBuffer(cubeVerts);
    const attributes = new InterleavedAttributes(vertBuffer, 32)
        .addAttribute('position', 0)
        .addAttribute('normal', 12)
        .addAttribute('texcoord', 24);

    super({
      attributes: [attributes],
      drawCount: 36
    });
  }
}
