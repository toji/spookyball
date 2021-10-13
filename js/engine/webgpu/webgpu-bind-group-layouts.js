// Since bind group layouts are used all over the place and frequently shared between
// systems, it's easier to initialize all the common ones in one place
export class WebGPUBindGroupLayouts {
  constructor(device) {
    this.frame = device.createBindGroupLayout({
      label: `Frame BindGroupLayout`,
      entries: [{
        binding: 0, // Camera uniforms
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: {},
      }, {
        binding: 1, // Light uniforms
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      }, {
        binding: 2, // Cluster Lights storage
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      }, {
        binding: 3, // Default Sampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      }, {
        binding: 4, // Shadow texture
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' }
      }, {
        binding: 5, // Shadow sampler
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'comparison' }
      }, {
        binding: 6, // Light/Shadow lookup table
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' }
      }, {
        binding: 7, // Shadow properites
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' }
      },]
    });

    this.instance = this.model = device.createBindGroupLayout({
      label: `Instance BindGroupLayout`,
      entries: [{
        binding: 0, // Instance uniforms
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          hasDynamicOffset: true,
          minBindingSize: 16 * Float32Array.BYTES_PER_ELEMENT * 4
        },
      }]
    });

    // These would be better off in some other location, but order of operations it tricky
    this.clusterBounds = device.createBindGroupLayout({
      label: `Cluster Storage BindGroupLayout`,
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }
      }]
    });

    this.clusterLights = device.createBindGroupLayout({
      label: `Cluster Bounds BindGroupLayout`,
      entries: [{
        binding: 0, // Camera uniforms
        visibility: GPUShaderStage.COMPUTE,
        buffer: {},
      }, {
        binding: 1, // Cluster Bounds
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      }, {
        binding: 2, // Cluster Lights
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }
      }, {
        binding: 3, // Light uniforms
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      }]
    });

    this.skin = device.createBindGroupLayout({
      label: 'Skin BindGroupLayout',
      entries: [{
        binding: 0, // joint buffer
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' }
      }, {
        binding: 1, // inverse bind matrix buffer
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' }
      }]
    });
  }
}