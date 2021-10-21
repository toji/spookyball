export const WEBGPU_DEFAULT_FLAGS = {
  // Adapter settings
  powerPreference: "high-performance",

  // Render target flags
  colorFormat: undefined, // Undefined indicates getPrefferedFormat should be used
  depthFormat: 'depth24plus',
  sampleCount: 4,
  resolutionMultiplier: 1,

  // Shadow mapping flags
  shadowsEnabled: true,
  shadowResolutionMultiplier: 1,
  shadowUpdateFrequency: 1, // A setting of 2 will only update the shadow map every other frame
  shadowSamples: 16, // May be 16, 4, or 1

  // Bloom
  bloomEnabled: true,
};