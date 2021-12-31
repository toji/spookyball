import { CameraStruct } from './common.js';

export const SSAOFragmentSource = `
${CameraStruct(0, 0)}

[[group(1), binding(0)]] var depthTexture : texture_depth_2d;
[[group(1), binding(1)]] var normalTexture : texture_2d<f32>;
[[group(1), binding(2)]] var noiseTexture : texture_2d<f32>;
[[group(1), binding(3)]] var defaultSampler : sampler;

struct SSAO {
  sampleCount : u32;
  samples : array<vec3<f32>>;
};
[[group(1), binding(4)]] var<storage, read> ssao : SSAO;

fn screen2View(texCoord : vec2<f32>, depth : f32) -> vec3<f32> {
  let clip = vec4(texCoord * 2.0 - vec2(1.0), depth, 1.0);
  let view = camera.inverseProjection * clip;
  return view.xyz / view.w;
}

fn linearDepth(depthSample : f32) -> f32 {
  return camera.zFar * camera.zNear / fma(depthSample, camera.zNear-camera.zFar, camera.zFar);
}

let sampleRadius = 0.2;
let sampleBias = 0.005;

[[stage(fragment)]]
fn fragmentMain([[location(0)]] texCoord : vec2<f32>, [[builtin(position)]] fragCoord: vec4<f32>) -> [[location(0)]] f32 {
  let normal = normalize(2.0 * textureSample(normalTexture, defaultSampler, texCoord).xyz - vec3(1.0));
  let depth = textureSample(depthTexture, defaultSampler, texCoord);

  let noiseCoord = fragCoord.xy / vec2<f32>(textureDimensions(noiseTexture));
  let noiseSample = textureSample(noiseTexture, defaultSampler, noiseCoord);
  let randomVec = normalize(vec3(2.0 * noiseSample.xy - vec2(1.0), noiseSample.z));

  let tangent = normalize(randomVec - normal * dot(randomVec, normal));
  let bitangent = cross(normal, tangent);
  let tbn = mat3x3(tangent, bitangent, normal);

  var viewPos = screen2View(texCoord, depth);
  let viewDepth = linearDepth(depth);

  var occlusion = 0.0;

  for (var i = 0u; i < ssao.sampleCount; i = i + 1u) {
    let samplePos = viewPos + (tbn * ssao.samples[i] * sampleRadius);
    var offset = vec4(samplePos, 1.0);
    offset = camera.projection * offset;
    let offsetCoord = (offset.xy / offset.w) * 0.5 + vec2(0.5);

    let sampleDepth = textureSample(depthTexture, defaultSampler, offsetCoord);
    let sampleZ = linearDepth(sampleDepth);

    let rangeCheck = smoothStep(0.0, 1.0, sampleRadius / abs(viewDepth - sampleZ));
    if (viewDepth > (sampleZ + sampleBias)) {
      occlusion = occlusion + rangeCheck;
    }
  }

  occlusion = 1.0 - (occlusion / f32(ssao.sampleCount));
  return occlusion; //pow(occlusion, 2.0);
}
`;