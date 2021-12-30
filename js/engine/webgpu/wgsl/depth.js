import { AttributeLocation } from "../../core/mesh.js";
import { CameraStruct, DefaultVertexOutput } from "./common.js";
import { wgsl } from "./wgsl-utils.js";

export const DepthResolveFragmentSource = `
[[group(0), binding(0)]] var msaaDepthTexture: texture_depth_multisampled_2d;

[[stage(fragment)]]
fn fragmentMain([[location(0)]] texCoord : vec2<f32>) -> [[builtin(frag_depth)]] f32 {
  let texel = vec2<i32>(texCoord * vec2<f32>(textureDimensions(msaaDepthTexture)));
  let sampleDepth = textureLoad(msaaDepthTexture, texel, 0);
  return sampleDepth;
}
`;

export function DepthPrepassFragmentSource(layout) { return `
  ${DefaultVertexOutput(layout)}

  [[stage(fragment)]]
  fn fragmentMain(input : VertexOutput) {
  }
`;
}

export function DepthNormalPrepassFragmentSource(layout) { return wgsl`
  ${CameraStruct()}
  ${DefaultVertexOutput(layout)}

  [[group(1), binding(3)]] var normalTexture : texture_2d<f32>;
  [[group(1), binding(4)]] var normalSampler : sampler;

  [[stage(fragment)]]
  fn fragmentMain(input : VertexOutput) -> [[location(0)]] vec4<f32>{
#if ${layout.locationsUsed.includes(AttributeLocation.tangent)}
    let tbn = mat3x3(input.tangent, input.bitangent, input.normal);
    let normalMap = textureSample(normalTexture, normalSampler, input.texcoord).rgb;
    let normal = tbn * (2.0 * normalMap - vec3(1.0));
#else
    let normal = input.normal;
#endif
    // Screen space normals
    return vec4(0.5 * normalize((camera.view * vec4(normal, 0.0)).xyz) + vec3(0.5), 1.0);

    // World space normals
    //return vec4(0.5 * normal + vec3(0.5), 1.0);
  }
`;
}