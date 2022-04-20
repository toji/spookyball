import { wgsl } from 'wgsl-preprocessor';
import { AttributeLocation } from '../../core/mesh.js';
import { CameraStruct, LightStruct, ColorConversions, DefaultVertexOutput } from './common.js';
import { ClusterLightsStruct, TileFunctions } from './clustered-light.js';
import { ShadowFunctions } from './shadow.js';

export const MATERIAL_BUFFER_SIZE = 11 * Float32Array.BYTES_PER_ELEMENT;
export function MaterialStruct(group = 1) { return `
  struct Material {
    baseColorFactor : vec4<f32>,
    emissiveFactor : vec3<f32>,
    occlusionStrength : f32,
    metallicRoughnessFactor : vec2<f32>,
    alphaCutoff : f32,
  };
  @group(${group}) @binding(0) var<uniform> material : Material;

  @group(${group}) @binding(1) var baseColorTexture : texture_2d<f32>;
  @group(${group}) @binding(2) var baseColorSampler : sampler;
  @group(${group}) @binding(3) var normalTexture : texture_2d<f32>;
  @group(${group}) @binding(4) var normalSampler : sampler;
  @group(${group}) @binding(5) var metallicRoughnessTexture : texture_2d<f32>;
  @group(${group}) @binding(6) var metallicRoughnessSampler : sampler;
  @group(${group}) @binding(7) var occlusionTexture : texture_2d<f32>;
  @group(${group}) @binding(8) var occlusionSampler : sampler;
  @group(${group}) @binding(9) var emissiveTexture : texture_2d<f32>;
  @group(${group}) @binding(10) var emissiveSampler : sampler;
`;
}

function PBRSurfaceInfo(layout) { return wgsl`
  ${DefaultVertexOutput(layout)}
  ${MaterialStruct()}

  struct SurfaceInfo {
    baseColor : vec4<f32>,
    albedo : vec3<f32>,
    metallic : f32,
    roughness : f32,
    normal : vec3<f32>,
    f0 : vec3<f32>,
    ao : f32,
    emissive : vec3<f32>,
    v : vec3<f32>,
  };

  fn GetSurfaceInfo(input : VertexOutput) -> SurfaceInfo {
    var surface : SurfaceInfo;
    surface.v = normalize(input.view);

#if ${layout.locationsUsed.includes(AttributeLocation.tangent)}
    let tbn = mat3x3(input.tangent, input.bitangent, input.normal);
    let N = textureSample(normalTexture, normalSampler, input.texcoord).rgb;
    surface.normal = normalize(tbn * (2.0 * N - vec3(1.0)));
#else
    surface.normal = normalize(input.normal);
#endif

    let baseColorMap = textureSample(baseColorTexture, baseColorSampler, input.texcoord);
    surface.baseColor = input.color * material.baseColorFactor * baseColorMap;
    if (surface.baseColor.a < material.alphaCutoff) {
      discard;
    }

    surface.albedo = surface.baseColor.rgb;

    let metallicRoughnessMap = textureSample(metallicRoughnessTexture, metallicRoughnessSampler, input.texcoord);
    surface.metallic = material.metallicRoughnessFactor.x * metallicRoughnessMap.b;
    surface.roughness = material.metallicRoughnessFactor.y * metallicRoughnessMap.g;

    let dielectricSpec = vec3(0.04);
    surface.f0 = mix(dielectricSpec, surface.albedo, vec3(surface.metallic));

    let occlusionMap = textureSample(occlusionTexture, occlusionSampler, input.texcoord);
    surface.ao = material.occlusionStrength * occlusionMap.r;

    let emissiveMap = textureSample(emissiveTexture, emissiveSampler, input.texcoord);
    surface.emissive = material.emissiveFactor * emissiveMap.rgb;

    if (input.instanceColor.a == 0.0) {
      surface.albedo = surface.albedo + input.instanceColor.rgb;
    } else {
      surface.albedo = surface.albedo * input.instanceColor.rgb;
    }

    return surface;
  }
`; }

// Much of the shader used here was pulled from https://learnopengl.com/PBR/Lighting
// Thanks!
function PBRFunctions(fullyRough) { return wgsl`
let PI = 3.14159265359;

let LightType_Point = 0u;
let LightType_Spot = 1u;
let LightType_Directional = 2u;

struct PuctualLight {
  lightType : u32,
  pointToLight : vec3<f32>,
  range : f32,
  color : vec3<f32>,
  intensity : f32,
};

fn FresnelSchlick(cosTheta : f32, F0 : vec3<f32>) -> vec3<f32> {
  return F0 + (vec3(1.0) - F0) * pow(1.0 - cosTheta, 5.0);
}

fn DistributionGGX(N : vec3<f32>, H : vec3<f32>, roughness : f32) -> f32 {
  let a      = roughness*roughness;
  let a2     = a*a;
  let NdotH  = max(dot(N, H), 0.0);
  let NdotH2 = NdotH*NdotH;

  let num    = a2;
  let denom  = (NdotH2 * (a2 - 1.0) + 1.0);

  return num / (PI * denom * denom);
}

fn GeometrySchlickGGX(NdotV : f32, roughness : f32) -> f32 {
  let r = (roughness + 1.0);
  let k = (r*r) / 8.0;

  let num   = NdotV;
  let denom = NdotV * (1.0 - k) + k;

  return num / denom;
}

fn GeometrySmith(N : vec3<f32>, V : vec3<f32>, L : vec3<f32>, roughness : f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2  = GeometrySchlickGGX(NdotV, roughness);
  let ggx1  = GeometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

fn lightAttenuation(light : PuctualLight) -> f32 {
  if (light.lightType == LightType_Directional) {
    return 1.0;
  }

  let distance = length(light.pointToLight);
  if (light.range <= 0.0) {
      // Negative range means no cutoff
      return 1.0 / pow(distance, 2.0);
  }
  return clamp(1.0 - pow(distance / light.range, 4.0), 0.0, 1.0) / pow(distance, 2.0);
}

fn lightRadiance(light : PuctualLight, surface : SurfaceInfo) -> vec3<f32> {
  let L = normalize(light.pointToLight);
  let H = normalize(surface.v + L);

// cook-torrance brdf
#if ${fullyRough}
  let NDF = 1.0 / PI;
  let G = 1.0;
#else
  let NDF = DistributionGGX(surface.normal, H, surface.roughness);
  let G = GeometrySmith(surface.normal, surface.v, L, surface.roughness);
#endif
  let F = FresnelSchlick(max(dot(H, surface.v), 0.0), surface.f0);

  let kD = (vec3(1.0) - F) * (1.0 - surface.metallic);
  let NdotL = max(dot(surface.normal, L), 0.0);

  let numerator = NDF * G * F;
  let denominator = max(4.0 * max(dot(surface.normal, surface.v), 0.0) * NdotL, 0.001);
  let specular = numerator / vec3(denominator);

  // add to outgoing radiance Lo
  let radiance = light.color * light.intensity * lightAttenuation(light);
  return (kD * surface.albedo / vec3(PI) + specular) * radiance * NdotL;
}`;
}

export function PBRFragmentSource(layout, fullyRough, flags) { return wgsl`
  ${ColorConversions}
  ${CameraStruct()}
  ${ClusterLightsStruct()}
  ${LightStruct()}
  ${TileFunctions}

#if ${flags.shadowsEnabled}
  ${ShadowFunctions(0, flags)}
#endif

  ${PBRSurfaceInfo(layout)}
  ${PBRFunctions(fullyRough)}

  struct FragmentOutput {
    @location(0) color : vec4<f32>,
#if ${flags.bloomEnabled}
    @location(1) emissive : vec4<f32>,
#endif
  };

  @stage(fragment)
  fn fragmentMain(input : VertexOutput) -> FragmentOutput {
    let surface = GetSurfaceInfo(input);

    // reflectance equation
    var Lo = vec3(0.0, 0.0, 0.0);

    // Process the directional light if one is present
    if (globalLights.dirIntensity > 0.0) {
      var light : PuctualLight;
      light.lightType = LightType_Directional;
      light.pointToLight = globalLights.dirDirection;
      light.color = globalLights.dirColor;
      light.intensity = globalLights.dirIntensity;

#if ${flags.shadowsEnabled}
      let lightVis = dirLightVisibility(input.worldPos);
#else
      let lightVis = 1.0;
#endif

      // calculate per-light radiance and add to outgoing radiance Lo
      Lo = Lo + lightRadiance(light, surface) * lightVis;
    }

    // Process each other light in the scene.
    let clusterIndex = getClusterIndex(input.position);
    let lightOffset  = clusterLights.lights[clusterIndex].offset;
    let lightCount   = clusterLights.lights[clusterIndex].count;

    for (var lightIndex = 0u; lightIndex < lightCount; lightIndex = lightIndex + 1u) {
      let i = clusterLights.indices[lightOffset + lightIndex];

      var light : PuctualLight;
      light.lightType = LightType_Point;
      light.pointToLight = globalLights.lights[i].position.xyz - input.worldPos;
      light.range = globalLights.lights[i].range;
      light.color = globalLights.lights[i].color;
      light.intensity = globalLights.lights[i].intensity;

#if ${flags.shadowsEnabled}
      let lightVis = pointLightVisibility(i, input.worldPos, light.pointToLight);
#else
      let lightVis = 1.0;
#endif

      // calculate per-light radiance and add to outgoing radiance Lo
      Lo = Lo + lightRadiance(light, surface) * lightVis;
    }

    let ambient = globalLights.ambient * surface.albedo * surface.ao;
    let color = linearTosRGB(Lo + ambient + surface.emissive);

    var out : FragmentOutput;
    out.color = vec4(color, surface.baseColor.a);
#if ${flags.bloomEnabled}
    out.emissive = vec4(surface.emissive, surface.baseColor.a);
#endif
    return out;
  }`;
};
