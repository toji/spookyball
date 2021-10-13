import {WebGLTextureLoader} from '../src/webgl-texture-loader.js';
import {mat4} from './gl-matrix/src/gl-matrix.js';

import * as Util from './gl-utils.js';

// For access to WebGL enums without a context.
const GL = WebGLRenderingContext;

const attributes = {
  position: 0,
  texCoord: 1,
};

const identity = mat4.create();
const cubeSpin = mat4.create();
mat4.scale(cubeSpin, cubeSpin, [0.7, 0.7, 0.7]);

class Tile2DRenderer {
  constructor(gl, vaoExt) {
    this.gl = gl;
    this.vaoExt = vaoExt;

    const vertexSrc = `
      attribute vec3 position;
      attribute vec2 texCoord;

      varying vec2 v_texCoord;

      uniform mat4 modelView;
      uniform mat4 projection;

      void main() {
        v_texCoord = texCoord;
        gl_Position = projection * modelView * vec4(position, 1.0);
      }
    `;

    const fragmentSrc = `
      precision mediump float;

      varying vec2 v_texCoord;

      uniform sampler2D baseColor;

      void main() {
        gl_FragColor = texture2D(baseColor, v_texCoord);
      }
    `;

    this.program = new Util.Program(gl, vertexSrc, fragmentSrc, attributes);

    if (vaoExt) {
      this.vao = vaoExt.createVertexArrayOES();
      vaoExt.bindVertexArrayOES(this.vao);
    } else {
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
    }

    this.vertBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0, 0.0,    0.0, 1.0,
      1.0, -1.0, 0.0,    1.0, 1.0,
      1.0, 1.0, 0.0,    1.0, 0.0,
      -1.0, 1.0, 0.0,    0.0, 0.0,
    ]), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([
      0, 1, 2,
      0, 2, 3
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(attributes.position);
    gl.enableVertexAttribArray(attributes.texCoord);
    gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(attributes.texCoord, 2, gl.FLOAT, false, 20, 12);

    if (vaoExt) {
      vaoExt.bindVertexArrayOES(null);
    } else {
      gl.bindVertexArray(null);
    }
  }

  bind(projectionMatrix) {
    const gl = this.gl;
    this.program.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.program.uniform.baseColor, 0);

    if (this.vaoExt) {
      this.vaoExt.bindVertexArrayOES(this.vao);
    } else {
      gl.bindVertexArray(this.vao);
    }

    // Draw the background
    gl.uniformMatrix4fv(this.program.uniform.projection, false, projectionMatrix);
  }

  draw(modelViewMatrix, texture) {
    const gl = this.gl;

    gl.uniformMatrix4fv(this.program.uniform.modelView, false, modelViewMatrix);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
}

class TileCubeRenderer {
  constructor(gl, vaoExt) {
    this.gl = gl;
    this.vaoExt = vaoExt;

    const vertexSrc = `
      attribute vec3 position;

      varying vec3 v_texCoord;

      uniform mat4 modelView;
      uniform mat4 projection;
      uniform mat4 cubeSpin;

      void main() {
        v_texCoord = normalize(position);
        gl_Position = projection * modelView * cubeSpin * vec4(position, 1.0);
      }
    `;

    const fragmentSrc = `
      precision mediump float;

      varying vec3 v_texCoord;

      uniform samplerCube baseColor;

      void main() {
        gl_FragColor = textureCube(baseColor, v_texCoord);
      }
    `;

    this.program = new Util.Program(gl, vertexSrc, fragmentSrc, attributes);

    if (vaoExt) {
      this.vao = vaoExt.createVertexArrayOES();
      vaoExt.bindVertexArrayOES(this.vao);
    } else {
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
    }

    this.vertBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
       1.0,  1.0,  1.0, // 0
      -1.0,  1.0,  1.0, // 1
       1.0, -1.0,  1.0, // 2
      -1.0, -1.0,  1.0, // 3
       1.0,  1.0, -1.0, // 4
      -1.0,  1.0, -1.0, // 5
       1.0, -1.0, -1.0, // 6
      -1.0, -1.0, -1.0, // 7
    ]), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([
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
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 12, 0);

    if (vaoExt) {
      vaoExt.bindVertexArrayOES(null);
    } else {
      gl.bindVertexArray(null);
    }
  }

  bind(projectionMatrix, cubeSpin) {
    const gl = this.gl;
    this.program.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.program.uniform.baseColor, 0);

    if (this.vaoExt) {
      this.vaoExt.bindVertexArrayOES(this.vao);
    } else {
      gl.bindVertexArray(this.vao);
    }

    gl.uniformMatrix4fv(this.program.uniform.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(this.program.uniform.cubeSpin, false, cubeSpin);
  }

  draw(modelViewMatrix, texture) {
    const gl = this.gl;

    gl.uniformMatrix4fv(this.program.uniform.modelView, false, modelViewMatrix);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  }
}

function WebTextureTypeToGLTarget(type) {
  switch (type) {
    case 'cube':
      return GL.TEXTURE_CUBE_MAP;
    case '2d':
    default:
      return GL.TEXTURE_2D;
  }
}

export class WebGLRenderer {
  constructor(useWebGL2 = false) {
    this.canvas = document.createElement('canvas');
    this.contextId = useWebGL2 ? 'webgl2' : 'webgl';
    this.mipmaps = true;
  }

  async initialize() {
    const gl = this.canvas.getContext(this.contextId);
    if (!gl) {
      throw new Error(`Requested context type "${this.contextId}" is not supported.`);
    }
    this.gl = gl;

    if (this.contextId != 'webgl2') {
      this.vaoExt = gl.getExtension('OES_vertex_array_object');
    }

    this.loader = new WebGLTextureLoader(gl);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
      gl.ZERO, gl.ONE
    );

    this.tile2DRenderer = new Tile2DRenderer(gl, this.vaoExt);
    this.tileCubeRenderer = new TileCubeRenderer(gl, this.vaoExt);

    this.checkerboard = await this.loader.fromUrl('textures/checkerboard.png');
  }

  onCanvasResize(width, height) {
    this.gl.viewport(0, 0, width, height);
  }

  initializeTile(tile) {
    tile.texture = null;
  }

  loadTextureFromUrl(tile, url) {
    return this.loader.fromUrl(url, {mipmaps: this.mipmaps}).then((result) => {
      const gl = this.gl;

      const target = WebTextureTypeToGLTarget(result.type);
      gl.bindTexture(target, result.texture);
      gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, result.mipLevels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);

      tile.texture = result.texture;
      tile.type = result.type;
      return result;
    }).catch((err) => {
      console.warn('Texture failed to load from URL: ', err);
      // If an error occurs plug in a solid color texture to fill it's place.
      const result = this.loader.fromColor(0.75, 0.0, 0.0);

      tile.texture = result.texture;
      tile.type = result.type;
      return result;
    });
  }

  loadTextureFromFile(tile, file) {
    return this.loader.fromBlob(file, {filename: file.name, mipmaps: this.mipmaps}).then((result) => {
      const gl = this.gl;

      const target = WebTextureTypeToGLTarget(result.type);
      gl.bindTexture(target, result.texture);
      gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, result.mipLevels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);

      tile.texture = result.texture;
      tile.type = result.type;
      return result;
    }).catch((err) => {
      console.warn('Texture failed to load from file: ', err);
      // If an error occurs plug in a solid color texture to fill it's place.
      const result = this.loader.fromColor(0.75, 0.0, 0.0);

      tile.texture = result.texture;
      tile.type = result.type;
      return result;
    });
  }

  onFrame(projectionMat, tiles, delta) {
    const gl = this.gl;

    mat4.rotateY(cubeSpin, cubeSpin, delta / 2000);
    mat4.rotateX(cubeSpin, cubeSpin, delta / 3000);

    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw the background
    this.tile2DRenderer.bind(identity);
    this.tile2DRenderer.draw(identity, this.checkerboard.texture);

    gl.uniformMatrix4fv(this.tile2DRenderer.program.uniform.projection, false, projectionMat);

    // Render all 2D tiles
    for (let tile of tiles) {
      if (tile.texture && tile.type == '2d') {
        this.tile2DRenderer.draw(tile.modelView, tile.texture);
      }
    }

    // Render all Cubemap tiles
    this.tileCubeRenderer.bind(projectionMat, cubeSpin);
    for (let tile of tiles) {
      if (tile.texture && tile.type == 'cube') {
        this.tileCubeRenderer.draw(tile.modelView, tile.texture);
      }
    }

    /*this.program.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.program.uniform.baseColor, 0);

    gl.bindVertexArray(this.vao);

    // Draw the background
    gl.uniformMatrix4fv(this.program.uniform.projection, false, identity);
    gl.uniformMatrix4fv(this.program.uniform.modelView, false, identity);
    gl.bindTexture(gl.TEXTURE_2D, this.checkerboard.texture);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.uniformMatrix4fv(this.program.uniform.projection, false, projectionMat);

    for (let tile of tiles) {
      if (tile.texture) {
        gl.uniformMatrix4fv(this.program.uniform.modelView, false, tile.modelView);
        gl.bindTexture(gl.TEXTURE_2D, tile.texture);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }
    }*/

    if (this.vaoExt) {
      this.vaoExt.bindVertexArrayOES(null);
    } else {
      gl.bindVertexArray(null);
    }
  }

  destroy() {
    if (this.loader) {
      this.loader.destroy();
    }
  }
}