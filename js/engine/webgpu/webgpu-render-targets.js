// Holds render targets which need to be shared between render passes.
export class WebGPURenderTargets extends EventTarget {
  context;

  msaaColorTexture;
  msaaDepthTexture;
  msaaEmissiveTexture;
  msaaNormalTexture;
  emissiveTexture;
  depthTexture;
  normalTexture;
  ssaoTexture;

  format = 'bgra8unorm';
  depthFormat = 'depth24plus';
  size = {width: 0, height: 0};

  constructor(adapter, device, canvas, flags) {
    super();

    this.format = flags.colorFormat;
    this.depthFormat = flags.depthFormat;
    this.sampleCount = flags.sampleCount;
    this.resolutionMultiplier = flags.resolutionMultiplier;

    this.useDepth = this.sampleCount == 1 || flags.ssaoEnabled;
    this.useEmissive = flags.bloomEnabled;
    this.useNormal = flags.ssaoEnabled;

    this.context = canvas.getContext('webgpu');

    // This function isn't available in Firefox, though it is in the spec.
    if (!this.format) {
      if (this.context.getPreferredFormat) {
        this.format = this.context.getPreferredFormat(adapter);
      } else {
        this.format = 'bgra8unorm';
      }
      flags.colorFormat = this.format;
    }

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
    this.context.configure({
      device: device,
      size: this.size,
      format: this.format,
    });

    if (this.sampleCount > 1) {
      this.msaaColorTexture = device.createTexture({
        size: this.size,
        sampleCount: this.sampleCount,
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    if (this.depthFormat) {
      if (this.sampleCount > 1) {
        this.msaaDepthTexture = device.createTexture({
          size: this.size,
          sampleCount: this.sampleCount,
          format: this.depthFormat,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
      }

      if (this.useDepth) {
        this.depthTexture = device.createTexture({
          size: this.size,
          format: this.depthFormat,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
      }
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
    }

    if (this.useNormal) {
      if (this.sampleCount > 1) {
        this.msaaNormalTexture = device.createTexture({
          size: this.size,
          sampleCount: this.sampleCount,
          format: this.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
      }
      this.normalTexture = device.createTexture({
        size: this.size,
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    }

    this.markReconfigured();
  }

  markReconfigured() {
    this.dispatchEvent(new Event('reallocate'));
    this.dispatchEvent(new Event('reconfigured'));
  }
}