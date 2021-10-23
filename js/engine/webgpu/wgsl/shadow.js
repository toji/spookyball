import { wgsl } from './wgsl-utils.js';
import { DefaultVertexOutput } from './common.js';

export function ShadowFunctions(group = 0, flags) { return wgsl`
  [[group(0), binding(3)]] var defaultSampler: sampler;
  [[group(${group}), binding(4)]] var shadowTexture : texture_depth_2d;
  [[group(${group}), binding(5)]] var shadowSampler : sampler_comparison;

  [[block]] struct LightShadowTable {
    light : array<i32>;
  };
  [[group(${group}), binding(6)]] var<storage, read> lightShadowTable : LightShadowTable;

#if ${flags.shadowSamples == 16}
  var<private> shadowSampleOffsets : array<vec2<f32>, 16> = array<vec2<f32>, 16>(
    vec2<f32>(-1.5, -1.5), vec2<f32>(-1.5, -0.5), vec2<f32>(-1.5, 0.5), vec2<f32>(-1.5, 1.5),
    vec2<f32>(-0.5, -1.5), vec2<f32>(-0.5, -0.5), vec2<f32>(-0.5, 0.5), vec2<f32>(-0.5, 1.5),
    vec2<f32>(0.5, -1.5), vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5), vec2<f32>(0.5, 1.5),
    vec2<f32>(1.5, -1.5), vec2<f32>(1.5, -0.5), vec2<f32>(1.5, 0.5), vec2<f32>(1.5, 1.5)
  );
#elif ${flags.shadowSamples == 4}
  var<private> shadowSampleOffsets : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
    vec2<f32>(-0.5, -0.5), vec2<f32>(-0.5, 0.5), vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5),
  );
#elif ${flags.shadowSamples == 2}
  var<private> shadowSampleOffsets : array<vec2<f32>, 2> = array<vec2<f32>, 2>(
    vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, 0.5)
  );
#elif ${flags.shadowSamples == 1}
  var<private> shadowSampleOffsets : array<vec2<f32>, 1> = array<vec2<f32>, 1>(
    vec2<f32>(0.0, 0.0)
  );
#else
  ERROR: Bad flag. shadowSampleCount must be 16, 4, 2, or 1
#endif

  let shadowSampleCount = ${flags.shadowSamples}u;

  struct ShadowProperties {
    viewport: vec4<f32>;
    viewProj: mat4x4<f32>;
  };
  [[block]] struct LightShadows {
    properties : array<ShadowProperties>;
  };
  [[group(${group}), binding(7)]] var<storage, read> shadow : LightShadows;

  fn dirLightVisibility(worldPos : vec3<f32>) -> f32 {
    let shadowIndex = lightShadowTable.light[0u];
    if (shadowIndex == -1) {
      return 1.0; // Not a shadow casting light
    }

    let viewport = shadow.properties[shadowIndex].viewport;
    let lightPos = shadow.properties[shadowIndex].viewProj * vec4<f32>(worldPos, 1.0);

    // Put into texture coordinates
    let shadowPos = vec3<f32>(
      ((lightPos.xy / lightPos.w)) * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
      lightPos.z / lightPos.w);

    let viewportPos = vec2<f32>(viewport.xy + shadowPos.xy * viewport.zw);

    let texelSize = 1.0 / vec2<f32>(textureDimensions(shadowTexture, 0));
    let clampRect = vec4<f32>(viewport.xy - texelSize, (viewport.xy+viewport.zw) + texelSize);

    // Percentage Closer Filtering
    var visibility : f32 = 0.0;
    for (var i : u32 = 0u; i < shadowSampleCount; i = i + 1u) {
      visibility = visibility + textureSampleCompareLevel(
        shadowTexture, shadowSampler,
        clamp(viewportPos + shadowSampleOffsets[i] * texelSize, clampRect.xy, clampRect.zw),
        shadowPos.z - 0.003);
    }
    return visibility / f32(shadowSampleCount);
  }

  // First two components of the return value are the texCoord, the third component is the face index.
  fn getCubeFace(v : vec3<f32>) -> i32{
    let vAbs = abs(v);

    if (vAbs.z >= vAbs.x && vAbs.z >= vAbs.y) {
      if (v.z < 0.0) {
        return 5;
      }
      return 4;
    }
    
    if (vAbs.y >= vAbs.x) {
      if (v.y < 0.0) {
        return 3;
      }
      return 2;
    }

    if (v.x < 0.0) {
      return 1;
    }
    return 0;
  }

  fn pointLightVisibility(lightIndex : u32, worldPos : vec3<f32>, pointToLight : vec3<f32>) -> f32 {
    var shadowIndex = lightShadowTable.light[lightIndex+1u];
    if (shadowIndex == -1) {
      return 1.0; // Not a shadow casting light
    }

    // Determine which face of the cubemap we're sampling from
    // TODO: Allow for PBR sampling across seams
    shadowIndex = shadowIndex + getCubeFace(pointToLight * -1.0);

    let viewport = shadow.properties[shadowIndex].viewport;
    let lightPos = shadow.properties[shadowIndex].viewProj * vec4<f32>(worldPos, 1.0);

    // Put into texture coordinates
    let shadowPos = vec3<f32>(
      ((lightPos.xy / lightPos.w)) * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
      lightPos.z / lightPos.w);

    let viewportPos = vec2<f32>(viewport.xy + shadowPos.xy * viewport.zw);

    let texelSize = 1.0 / vec2<f32>(textureDimensions(shadowTexture, 0));
    let clampRect = vec4<f32>(viewport.xy, (viewport.xy+viewport.zw));

    // Percentage Closer Filtering
    var visibility : f32 = 0.0;
    for (var i : u32 = 0u; i < shadowSampleCount; i = i + 1u) {
      visibility = visibility + textureSampleCompareLevel(
        shadowTexture, shadowSampler,
        clamp(viewportPos + shadowSampleOffsets[i] * texelSize, clampRect.xy, clampRect.zw),
        shadowPos.z - 0.01);
    }
    return visibility / f32(shadowSampleCount);
  }
`;
}

export function ShadowFragmentSource(layout) { return `
  ${DefaultVertexOutput(layout)}

  [[stage(fragment)]]
  fn fragmentMain(input : VertexOutput) {
  }
`;
}
