# Web Texture Tool

A low-frills library for loading a large variety of image formats into WebGL or WebGPU textures as efficiently as
possible.

# WARNING

**This repo is still a work in progress!** The interface is subject to change as the scope and functionality of the library evolves.

# Basic Usage

First, an appropriate instance of `WebGLTextureLoader` must be created. If your application is using WebGL, an instance of
the extended `WebGLTextureLoader` class should be constructed, passing the WebGL context:

```js
import { WebGLTextureLoader } from "web-texture-tool/webgl-texture-loader.js"

// Get a WebGL context
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl');

const loader = new WebGLTextureLoader(gl);
```

Alternately, a `WebGPUTextureLoader` can be created for use with WebGPU devices:

```js
import { WebGPUTextureLoader } from "web-texture-tool/webgpu-texture-loader.js"

// Get a WebGPU device
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const loader = new WebGPUTextureLoader(device);
```

These classes have identical interfaces aside from the constructor.

Once you have an instance, loading most textures is as easy as calling `fromUrl`:

```js
const result = await loader.fromUrl('textures/checkerboard.jpg');
```

The method returns a promise which resolves to a `WebTextureResult` object, which contains:

 - `texture`, a WebGLTexture or GPUTexture
 - `width`, `height`, and `depth` of the texture in pixels
 - `type`, the WebGPU texture type such as `2d` or `cube-map`
 - `format`, the WebGPU texture format such as `'rgba8unorm'`
 - `mipLevels`, the number of mipmap levels the texture contains

Texture dimensions, type, and format should be treated as immutable, as they will be allocated that way with any APIs
that allow or enforce it.

# Overriding extensions

When loading textures from a URL the loader will try to determine the file type automatically based on
any extension it finds in the path. For example, with the code:

```js
const result = await loader.fromUrl('textures/FLOOR_1.PNG?debug=1');
```

The automatically determined extension will be `png`, and so the file will attempt to load as a PNG image file. (Note
that query string are ignored.)

In some cases an automatically parsed extension may not be able to be determined or may be wrong. For example:

```js
const result = await loader.fromUrl('assets.php?id=123');
```

In this case the URL may return an image but by default the system will assume that the extension is `php`, which has no
loader associated with it since it's not an image format. If, however, you know that this page returns JPEG images, you can explicitly indicate it by setting the `mimeType` option like so:

```js
const result = await wtt.textureFromUrl('assets.php?id=123', { mimeType: 'image/jpeg' });
```

Now the returned data will attempt to parse as a JPEG.
