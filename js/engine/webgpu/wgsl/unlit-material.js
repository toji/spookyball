import { ColorConversions, DefaultVertexOutput } from './common.js';

export const MATERIAL_BUFFER_SIZE = 5 * Float32Array.BYTES_PER_ELEMENT;
export function MaterialStruct(group = 1) { return `
  struct Material {
    baseColorFactor : vec4<f32>,
    alphaCutoff : f32,
  };
  @group(${group}) @binding(0) var<uniform> material : Material;

  @group(${group}) @binding(1) var baseColorTexture : texture_2d<f32>;
  @group(${group}) @binding(2) var baseColorSampler : sampler;
`;
}

export function UnlitFragmentSource(layout) { return `
  ${ColorConversions}
  ${DefaultVertexOutput(layout)}
  ${MaterialStruct()}

  @fragment
  fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> {
    let baseColorMap = textureSample(baseColorTexture, baseColorSampler, input.texcoord);
    if (baseColorMap.a < material.alphaCutoff) {
      discard;
    }
    let baseColor = input.color * material.baseColorFactor * baseColorMap;
    return vec4(linearTosRGB(baseColor.rgb), baseColor.a);
  }`;
};
