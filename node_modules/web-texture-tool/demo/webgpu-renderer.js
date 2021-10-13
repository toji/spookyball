import {WebGPUTextureLoader} from '../src/webgpu-texture-loader.js';
import {mat4} from './gl-matrix/src/gl-matrix.js';

const SAMPLE_COUNT = 4;
const DEPTH_FORMAT = 'depth24plus';

const identity = mat4.create();
const cubeSpin = mat4.create();
mat4.translate(cubeSpin, cubeSpin, [0.0, 0.0, -2.0]);
mat4.scale(cubeSpin, cubeSpin, [0.7, 0.7, 0.7]);

const wgslSrc = {
  backgroundVertex: `
    var<private> pos : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
      vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0)
    );
    var<private> tex : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
      vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0)
    );

    struct VertexOut {
      [[builtin(position)]] Position : vec4<f32>;
      [[location(0)]] vTex : vec2<f32>;
    };

    [[stage(vertex)]]
    fn main([[builtin(vertex_index)]] VertexIndex : u32) -> VertexOut {
      var output : VertexOut;
      output.vTex = tex[VertexIndex];
      output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
      return output;
    }
  `,
  fragment: `
    [[binding(1), group(0)]] var imgSampler : sampler;
    [[binding(2), group(0)]] var img : texture_2d<f32>;

    [[stage(fragment)]]
    fn main([[location(0)]] vTex : vec2<f32>) -> [[location(0)]] vec4<f32> {
      return textureSample(img, imgSampler, vTex);
    }
  `
};

class Tile2DRenderer {
  constructor(renderer) {
    this.device = renderer.device;

    const vertexSrc = `
      var<private> pos : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0)
      );
      var<private> tex : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0)
      );

      struct VertexOut {
        [[builtin(position)]] Position : vec4<f32>;
        [[location(0)]] vTex : vec2<f32>;
      };

      [[block]] struct TileUniforms {
        modelViewMatrix : mat4x4<f32>;
      };
      [[group(0), binding(0)]] var<uniform> tileUniforms : TileUniforms;

      [[block]] struct FrameUniforms {
        projectionMatrix : mat4x4<f32>;
      };
      [[group(1), binding(0)]] var<uniform> frameUniforms : FrameUniforms;

      [[stage(vertex)]]
      fn main([[builtin(vertex_index)]] VertexIndex : u32) -> VertexOut {
        var output : VertexOut;
        output.vTex = tex[VertexIndex];
        output.Position = frameUniforms.projectionMatrix * tileUniforms.modelViewMatrix * vec4<f32>(pos[VertexIndex], 0.0, 1.0);
        return output;
      }
    `;

    const fragmentSrc = `
      [[group(0), binding(1)]] var imgSampler : sampler;
      [[group(0), binding(2)]] var img : texture_2d<f32>;

      [[stage(fragment)]]
      fn main([[location(0)]] vTex : vec2<f32>) -> [[location(0)]] vec4<f32> {
        return textureSample(img, imgSampler, vTex);
      }
    `;

    // Tile rendering setup
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          renderer.bindGroupLayouts.tile2D,
          renderer.bindGroupLayouts.frameUniforms,
        ]
      }),
      vertex: {
        module: this.device.createShaderModule({
          code: vertexSrc
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: this.device.createShaderModule({
          code: fragmentSrc
        }),
        entryPoint: 'main',
        targets: [{
          format: renderer.swapChainFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
            },
            alpha: {
              srcFactor: 'zero',
              dstFactor: 'one'
            }
          }
        }],
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: 'uint32',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: DEPTH_FORMAT,
      },
      multisample: {
        count: SAMPLE_COUNT,
      }
    });
  }

  draw(passEncoder, tile) {
    if (tile.texture) {
      this.device.queue.writeBuffer(tile.uniformBuffer, 0, tile.modelView);
      passEncoder.setBindGroup(0, tile.bindGroup);
      passEncoder.draw(4, 1, 0, 0);
    }
  }
}

class TileCubeRenderer {
  constructor(renderer) {
    this.device = renderer.device;

    const vertexSrc = `
      struct VertexOut {
        [[builtin(position)]] Position : vec4<f32>;
        [[location(0)]] vTex : vec3<f32>;
      };

      [[block]] struct TileUniforms {
        modelViewMatrix : mat4x4<f32>;
      };
      [[binding(0), group(0)]] var<uniform> tileUniforms : TileUniforms;

      [[block]] struct FrameUniforms {
        projectionMatrix : mat4x4<f32>;
        cubeSpin : mat4x4<f32>;
      };
      [[binding(0), group(1)]] var<uniform> frameUniforms : FrameUniforms;

      [[stage(vertex)]]
      fn main([[location(0)]] position : vec3<f32>) -> VertexOut {
        var output : VertexOut;
        output.vTex = normalize(position);
        output.Position = frameUniforms.projectionMatrix * tileUniforms.modelViewMatrix * frameUniforms.cubeSpin * vec4<f32>(position, 1.0);
        return output;
      }
    `;

    const fragmentSrc = `
      [[binding(1), group(0)]] var imgSampler : sampler;
      [[binding(2), group(0)]] var img : texture_cube<f32>;

      [[stage(fragment)]]
      fn main([[location(0)]] vTex : vec3<f32>) -> [[location(0)]] vec4<f32> {
        return textureSample(img, imgSampler, vTex);
      }
    `;

    // Tile rendering setup
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          renderer.bindGroupLayouts.tileCube,
          renderer.bindGroupLayouts.frameUniforms,
        ]
      }),
      vertex: {
        module: this.device.createShaderModule({
          code: vertexSrc
        }),
        entryPoint: 'main',
        buffers: [{
          arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
          attributes: [{
            shaderLocation: 0,
            format: 'float32x3',
            offset: 0,
          }]
        }],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: fragmentSrc
        }),
        entryPoint: 'main',
        targets: [{
          format: renderer.swapChainFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
            },
            alpha: {
              srcFactor: 'zero',
              dstFactor: 'one'
            }
          }
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: DEPTH_FORMAT,
      },
      multisample: {
        count: SAMPLE_COUNT,
      }
    });

    const vertexArray = new Float32Array([
       1.0,  1.0,  1.0, // 0
      -1.0,  1.0,  1.0, // 1
       1.0, -1.0,  1.0, // 2
      -1.0, -1.0,  1.0, // 3
       1.0,  1.0, -1.0, // 4
      -1.0,  1.0, -1.0, // 5
       1.0, -1.0, -1.0, // 6
      -1.0, -1.0, -1.0, // 7
    ]);

    this.vertexBuffer = this.device.createBuffer({
      size: vertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexArray);

    const indexArray = new Uint16Array([
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

    this.indexBuffer = this.device.createBuffer({
      size: indexArray.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indexArray);
  }

  draw(passEncoder, tile) {
    if (tile.texture) {
      this.device.queue.writeBuffer(tile.uniformBuffer, 0, tile.modelView);
      passEncoder.setBindGroup(0, tile.bindGroup);
      passEncoder.setVertexBuffer(0, this.vertexBuffer);
      passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
      passEncoder.drawIndexed(36, 1, 0, 0);
    }
  }
}

export class WebGPURenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('webgpu');
    this.mipmaps = true;
  }

  async initialize() {
    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance"
    });
    let requiredFeatures = [];

    const featureList = this.adapter.features;
    if (featureList.has('texture-compression-bc')) {
      requiredFeatures.push('texture-compression-bc');
    }

    this.device = await this.adapter.requestDevice({
      requiredFeatures
    });
    this.loader = new WebGPUTextureLoader(this.device);

    // Swap chain setup
    this.swapChainFormat = this.context.getPreferredFormat(this.adapter);

    this.colorAttachment = {
      // view is acquired and set in onCanvasResize.
      view: undefined,
      // resolveTarget is acquired and set in onFrame.
      resolveTarget: undefined,
      loadValue: {r: 0.0, g: 0.0, b: 0.0, a: 1.0},
      storeOp: 'store',
    };

    this.depthAttachment = {
      // view is acquired and set in onCanvasResize.
      view: undefined,
      depthLoadValue: 1.0,
      depthStoreOp: 'store',
      stencilLoadValue: 0,
      stencilStoreOp: 'store',
    };

    this.renderPassDescriptor = {
      colorAttachments: [this.colorAttachment],
      depthStencilAttachment: this.depthAttachment
    };

    this.onCanvasResize(this.canvas.width, this.canvas.height);

    this.bindGroupLayouts = {
      tile2D: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        ]
      }),
      tileCube: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: 'cube' } },
        ]
      }),
      frameUniforms :this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX,buffer: {} }
        ]
      })
    };

    this.tileSampler = this.device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear'
    });

    this.tile2DRenderer = new Tile2DRenderer(this);
    this.tileCubeRenderer = new TileCubeRenderer(this);

    this.frameUniformsBuffer = this.device.createBuffer({
      size: 32 * Float32Array.BYTES_PER_ELEMENT, // Enough for two matrices
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    this.frameUniformBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.frameUniforms,
      entries: [{
        binding: 0,
        resource: {
          buffer: this.frameUniformsBuffer,
        },
      }],
    });

    // Background rendering setup
    this.backgroundPipeline = this.device.createRenderPipeline({
      vertex: {
        module: this.device.createShaderModule({
          code: wgslSrc.backgroundVertex
        }),
        entryPoint: 'main'
      },
      fragment: {
        module: this.device.createShaderModule({
          code: wgslSrc.fragment
        }),
        entryPoint: 'main',
        targets: [{
          format: this.swapChainFormat,
        }],
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: 'uint16',
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: DEPTH_FORMAT,
      },
      multisample: {
        count: SAMPLE_COUNT,
      }
    });

    const checkerboard = await this.loader.fromUrl('textures/checkerboard.png');
    //const checkerboard = this.loader.fromColor(0, 0, 0.2, 1.0);

    this.backgroundBindGroup = this.device.createBindGroup({
      layout: this.backgroundPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 1,
        resource: this.tileSampler,
      }, {
        binding: 2,
        resource: checkerboard.texture.createView(),
      }],
    });
  }

  onCanvasResize(width, height) {
    if (!this.device) return;

    this.context.configure({
      device: this.device,
      format: this.swapChainFormat,
      size: { width, height },
    });

    const msaaColorTexture = this.device.createTexture({
      size: { width, height },
      sampleCount: SAMPLE_COUNT,
      format: this.swapChainFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.colorAttachment.view = msaaColorTexture.createView();

    const depthTexture = this.device.createTexture({
      size: { width, height },
      sampleCount: SAMPLE_COUNT,
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.depthAttachment.view = depthTexture.createView();
  }

  initializeTile(tile) {
    tile.texture = null;
    tile.bindGroup = null;

    tile.uniformBuffer = this.device.createBuffer({
      size: 16 * Float32Array.BYTES_PER_ELEMENT, // Enough for one matrix
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
  }

  updateTileWithResult(tile, result) {
    let view;
    let layout;
    switch (result.type) {
      case 'cube':
        view = result.texture.createView({dimension: 'cube'});
        layout = this.tileCubeRenderer.pipeline.getBindGroupLayout(0);
        break;
      default:
        view = result.texture.createView({dimension: '2d', arrayLayerCount: 1});
        layout = this.tile2DRenderer.pipeline.getBindGroupLayout(0);
        break;
    }

    const bindGroup = this.device.createBindGroup({
      layout,
      entries: [{
        binding: 0,
        resource: {
          buffer: tile.uniformBuffer,
        },
      },{
        binding: 1,
        resource: this.tileSampler,
      }, {
        binding: 2,
        resource: view,
      }],
    });

    tile.bindGroup = bindGroup;
    tile.texture = result.texture;
    tile.type = result.type;

    return result;
  }

  loadTextureFromUrl(tile, url) {
    return this.loader.fromUrl(url, {mipmaps: this.mipmaps}).then((result) => {
      return this.updateTileWithResult(tile, result);
    }).catch((err) => {
      console.warn('Texture failed to load from URL: ', err);

      // If an error occurs plug in a solid color texture to fill it's place.
      const result = this.loader.fromColor(0.75, 0.0, 0.0);
      return this.updateTileWithResult(tile, result);
    });
  }

  loadTextureFromFile(tile, file) {
    return this.loader.fromBlob(file, {filename: file.name, mipmaps: this.mipmaps}).then((result) => {
      return this.updateTileWithResult(tile, result);
    }).catch((err) => {
      console.warn('Texture failed to load from File: ', err);

      // If an error occurs plug in a solid color texture to fill it's place.
      const result = this.loader.fromColor(0.75, 0.0, 0.0);
      return this.updateTileWithResult(tile, result);
    });
  }

  onFrame(projectionMat, tiles, delta) {
    mat4.rotateY(cubeSpin, cubeSpin, delta / 2000);
    mat4.rotateX(cubeSpin, cubeSpin, delta / 3000);

    // Update the FrameUniforms buffer with the values that are used by every
    // program and don't change for the duration of the frame.
    this.device.queue.writeBuffer(this.frameUniformsBuffer, 0, projectionMat);
    this.device.queue.writeBuffer(this.frameUniformsBuffer, 64, cubeSpin);

    this.colorAttachment.resolveTarget = this.context.getCurrentTexture().createView();

    const commandEncoder = this.device.createCommandEncoder({});

    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

    // Draw a checkered background (mostly so we can see alpha effects).
    passEncoder.setPipeline(this.backgroundPipeline);
    passEncoder.setBindGroup(0, this.backgroundBindGroup);
    passEncoder.draw(4, 1, 0, 0);

    // Draw each tile.
    passEncoder.setBindGroup(1, this.frameUniformBindGroup);

    let bindPipeline = true;
    for (let tile of tiles) {
      if (tile.texture && tile.type == '2d') {
        if (bindPipeline) {
          passEncoder.setPipeline(this.tile2DRenderer.pipeline);
          bindPipeline = false;
        }
        this.tile2DRenderer.draw(passEncoder, tile);
      }
    }

    bindPipeline = true;
    for (let tile of tiles) {
      if (tile.texture && tile.type == 'cube') {
        if (bindPipeline) {
          passEncoder.setPipeline(this.tileCubeRenderer.pipeline);
          bindPipeline = false;
        }
        this.tileCubeRenderer.draw(passEncoder, tile);
      }
    }

    passEncoder.endPass();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  destroy() {
    if (this.loader) {
      this.loader.destroy();
    }
  }
}
