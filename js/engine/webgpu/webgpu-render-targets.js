// Holds render targets which need to be shared between render passes.
export class WebGPURenderTargets extends EventTarget {
  context;

  msaaColorTexture;
  msaaEmissiveTexture;
  emissiveTexture;
  depthTexture;

  format = 'bgra8unorm';
  depthFormat = 'depth24plus';
  size = {width: 0, height: 0};

  constructor(adapter, device, canvas, flags) {
    super();

    this.format = flags.colorFormat;
    this.depthFormat = flags.depthFormat;
    this.sampleCount = flags.sampleCount;
    this.resolutionMultiplier = flags.resolutionMultiplier;

    this.useEmissive = flags.bloomEnabled;

    this.context = canvas.getContext('webgpu');

    // This function isn't available in Firefox, though it is in the spec.
    if (!this.format) {
      if (navigator.gpu.getPreferredCanvasFormat) {
        this.format = navigator.gpu.getPreferredCanvasFormat();
      } else if (this.context.getPreferredFormat) {
        this.format = this.context.getPreferredFormat(adapter);
      } else {
        this.format = 'bgra8unorm';
      }
      flags.colorFormat = this.format;
    }

    this.context.configure({
      device: device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target != canvas) { continue; }

        if (entry.devicePixelContentBoxSize) {
          // Should give exact pixel dimensions, but only works on Chrome.
          const devicePixelSize = entry.devicePixelContentBoxSize[0];
          this.onCanvasResized(device, devicePixelSize.inlineSize, devicePixelSize.blockSize);
        } else if (entry.contentBoxSize) {
          // Firefox implements `contentBoxSize` as a single content rect, rather than an array
          const contentBoxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
          this.onCanvasResized(device, contentBoxSize.inlineSize, contentBoxSize.blockSize);
        } else {
          this.onCanvasResized(device, entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    this.resizeObserver.observe(canvas);
    this.onCanvasResized(device, canvas.width, canvas.height);
  }

  onCanvasResized(device, pixelWidth, pixelHeight) {
    this.size.width = pixelWidth * this.resolutionMultiplier;
    this.size.height = pixelHeight * this.resolutionMultiplier;
    this.context.canvas.width = this.size.width;
    this.context.canvas.height = this.size.height;

    if (this.sampleCount > 1) {
      this.msaaColorTexture = device.createTexture({
        size: this.size,
        sampleCount: this.sampleCount,
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    if (this.depthFormat) {
      this.depthTexture = device.createTexture({
        size: this.size,
        sampleCount: this.sampleCount,
        format: this.depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
    }

    if (this.useEmissive) {
      if (this.sampleCount > 1) {
        this.msaaEmissiveTexture = device.createTexture({
          size: this.size,
          sampleCount: this.sampleCount,
          format: this.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
      }
      this.emissiveTexture = device.createTexture({
        size: this.size,
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });

      const bloomSize = {
        width: Math.floor(this.size.width * 0.5),
        height: Math.floor(this.size.height * 0.5)
      };
      this.bloomTextures = [
        device.createTexture({
          size: bloomSize,
          format: this.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
        // Two last-stage textures for ping-ponging to allow glowy trails.
        device.createTexture({
          size: bloomSize,
          format: this.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
        device.createTexture({
          size: bloomSize,
          format: this.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
      ];
    }

    this.dispatchEvent(new Event('reconfigured'));
  }
}