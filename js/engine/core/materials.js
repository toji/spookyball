let nextMaterialId = 1;

export class UnlitMaterial {
  id = nextMaterialId++;
  baseColorFactor = new Float32Array([1.0, 1.0, 1.0, 1.0]);
  baseColorTexture;
  baseColorSampler;
  transparent = false;
  doubleSided = false;
  alphaCutoff = 0.0;
  depthWrite = true;
  depthCompare = 'less';
  castsShadow = true;
  additiveBlend = false;
};

export class PBRMaterial extends UnlitMaterial {
  normalTexture;
  normalSampler;
  metallicFactor = 0.0;
  roughnessFactor = 1.0;
  metallicRoughnessTexture;
  metallicRoughnessSampler;
  emissiveFactor = new Float32Array([0.0, 0.0, 0.0]);
  emissiveTexture;
  emissiveSampler;
  occlusionTexture;
  occlusionSampler;
  occlusionStrength = 1.0;
};

export class PBRSpecularGlossMaterial extends UnlitMaterial {
  
}