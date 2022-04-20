export const BloomBlurCommon = `
// Values from https://www.rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling/
var<private> offsets : array<f32, 3> = array<f32, 3>(
  0.0, 1.3846153846, 3.2307692308);
var<private> weights : array<f32, 3> = array<f32, 3>(
  0.2270270270, 0.3162162162, 0.0702702703);

struct BloomUniforms {
  radius : f32,
  dim : f32,
};
@group(0) @binding(0) var<uniform> bloom : BloomUniforms;
@group(0) @binding(1) var bloomTexture : texture_2d<f32>;
@group(0) @binding(2) var bloomSampler : sampler;

struct FragmentInput {
  @location(0) texCoord : vec2<f32>
};

fn getGaussianBlur(texCoord : vec2<f32>) -> vec4<f32> {
  let texelRadius = vec2(bloom.radius) / vec2<f32>(textureDimensions(bloomTexture));
  let step = bloomDir * texelRadius;

  var sum = vec4(0.0);

  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord) * weights[0];

  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord + step * 1.0) * weights[1];
  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord - step * 1.0) * weights[1];

  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord + step * 2.0) * weights[2];
  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord - step * 2.0) * weights[2];

  // This is more compact than the unrolled loop above, but was causing corruption on older Mac Intel GPUs.
  //for (var i = 1; i < 3; i = i + 1) {
  //  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord + step * f32(i)) * weights[i];
  //  sum = sum + textureSample(bloomTexture, bloomSampler, texCoord - step * f32(i)) * weights[i];
  //}

  return vec4(sum.rgb, 1.0);
}
`;

export const BloomBlurHorizontalFragmentSource = `
let bloomDir = vec2(1.0, 0.0);
${BloomBlurCommon}

@stage(fragment)
fn fragmentMain(input : FragmentInput) -> @location(0) vec4<f32> {
  return getGaussianBlur(input.texCoord);
}
`;

// Combines the vertical blur step and a dimming of the previous blur results to allow for glowing trails.
export const BloomBlurVerticalFragmentSource = `
let bloomDir = vec2(0.0, 1.0);
${BloomBlurCommon}

@group(0) @binding(3) var prevTexture : texture_2d<f32>;

@stage(fragment)
fn fragmentMain(input : FragmentInput) -> @location(0) vec4<f32> {
  let blurColor = getGaussianBlur(input.texCoord);
  let dimColor = textureSample(prevTexture, bloomSampler, input.texCoord) * bloom.dim;

  return blurColor + dimColor;
}
`;

export const BloomBlendFragmentSource = `
@group(0) @binding(0) var bloomTexture : texture_2d<f32>;
@group(0) @binding(1) var bloomSampler : sampler;

struct FragmentInput {
  @location(0) texCoord : vec2<f32>
};

@stage(fragment)
fn fragmentMain(input : FragmentInput) -> @location(0) vec4<f32> {
  let color = textureSample(bloomTexture, bloomSampler, input.texCoord);
  return vec4(color.rgb, 1.0);
}
`;
