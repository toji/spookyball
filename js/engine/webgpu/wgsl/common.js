import { wgsl } from './wgsl-utils.js';
import { AttributeLocation } from '../../core/mesh.js';

export const CAMERA_BUFFER_SIZE = 56 * Float32Array.BYTES_PER_ELEMENT;
export function CameraStruct(group = 0, binding = 0) { return `
  [[block]] struct Camera {
    projection : mat4x4<f32>;
    inverseProjection : mat4x4<f32>;
    view : mat4x4<f32>;
    position : vec3<f32>;
    time : f32;
    outputSize : vec2<f32>;
    zNear : f32;
    zFar : f32;
  };
  [[group(${group}), binding(${binding})]] var<uniform> camera : Camera;
`;
}

export const LIGHT_BUFFER_SIZE = 8 * Float32Array.BYTES_PER_ELEMENT;
export function LightStruct(group = 0, binding = 1) { return `
  struct Light {
    position : vec3<f32>;
    range : f32;
    color : vec3<f32>;
    intensity : f32;
  };

  [[block]] struct GlobalLights {
    ambient : vec3<f32>;
    dirColor : vec3<f32>;
    dirIntensity : f32;
    dirDirection : vec3<f32>;
    lightCount : u32;
    lights : [[stride(32)]] array<Light>;
  };
  [[group(${group}), binding(${binding})]] var<storage, read> globalLights : GlobalLights;
`;
}

export function SkinStructs(group = 1) { return `
  [[block]] struct Joints {
    matrices : [[stride(64)]] array<mat4x4<f32>>;
  };
  [[group(${group}), binding(0)]] var<storage, read> joint : Joints;
  [[group(${group}), binding(1)]] var<storage, read> inverseBind : Joints;
`};

export const GetSkinMatrix = `
  fn getSkinMatrix(input : VertexInput) -> mat4x4<f32> {
    let joint0 = joint.matrices[input.joints.x] * inverseBind.matrices[input.joints.x];
    let joint1 = joint.matrices[input.joints.y] * inverseBind.matrices[input.joints.y];
    let joint2 = joint.matrices[input.joints.z] * inverseBind.matrices[input.joints.z];
    let joint3 = joint.matrices[input.joints.w] * inverseBind.matrices[input.joints.w];

    let skinMatrix = joint0 * input.weights.x +
                     joint1 * input.weights.y +
                     joint2 * input.weights.z +
                     joint3 * input.weights.w;
    return skinMatrix;
  }
`;

export const INSTANCE_SIZE_F32 = 20;
export const INSTANCE_SIZE_BYTES = INSTANCE_SIZE_F32 * Float32Array.BYTES_PER_ELEMENT;

export function DefaultVertexInput(layout) {
  let inputs = layout.locationsUsed.map((location) => {
      switch(location) {
      case AttributeLocation.position: return `[[location(${AttributeLocation.position})]] position : vec4<f32>;`;
      case AttributeLocation.normal: return `[[location(${AttributeLocation.normal})]] normal : vec3<f32>;`;
      case AttributeLocation.tangent: return `[[location(${AttributeLocation.tangent})]] tangent : vec4<f32>;`;
      case AttributeLocation.texcoord: return `[[location(${AttributeLocation.texcoord})]] texcoord : vec2<f32>;`;
      case AttributeLocation.texcoord2: return `[[location(${AttributeLocation.texcoord2})]] texcoord2 : vec2<f32>;`;
      case AttributeLocation.color: return `[[location(${AttributeLocation.color})]] color : vec4<f32>;`;
      case AttributeLocation.joints: return `[[location(${AttributeLocation.joints})]] joints : vec4<u32>;`;
      case AttributeLocation.weights: return `[[location(${AttributeLocation.weights})]] weights : vec4<f32>;`;
      }
  });

  inputs.push(`[[location(${AttributeLocation.maxAttributeLocation})]] instance0 : vec4<f32>;`);
  inputs.push(`[[location(${AttributeLocation.maxAttributeLocation+1})]] instance1 : vec4<f32>;`);
  inputs.push(`[[location(${AttributeLocation.maxAttributeLocation+2})]] instance2 : vec4<f32>;`);
  inputs.push(`[[location(${AttributeLocation.maxAttributeLocation+3})]] instance3 : vec4<f32>;`);
  inputs.push(`[[location(${AttributeLocation.maxAttributeLocation+4})]] instanceColor : vec4<f32>;`);

  return `struct VertexInput {
    ${inputs.join('\n')}
  };`;
};

export function DefaultVertexOutput(layout) { return wgsl`
  struct VertexOutput {
    [[builtin(position)]] position : vec4<f32>;
    [[location(0)]] worldPos : vec3<f32>;
    [[location(1)]] view : vec3<f32>; // Vector from vertex to camera.
    [[location(2)]] texcoord : vec2<f32>;
    [[location(3)]] texcoord2 : vec2<f32>;
    [[location(4)]] color : vec4<f32>;
    [[location(5)]] instanceColor : vec4<f32>;
    [[location(6)]] normal : vec3<f32>;

#if ${layout.locationsUsed.includes(AttributeLocation.tangent)}
    [[location(7)]] tangent : vec3<f32>;
    [[location(8)]] bitangent : vec3<f32>;
#endif
  };
`;
}

export const GetInstanceMatrix = `
  fn getInstanceMatrix(input : VertexInput) -> mat4x4<f32> {
    return mat4x4<f32>(
      input.instance0,
      input.instance1,
      input.instance2,
      input.instance3
    );
  }
`;

const APPROXIMATE_SRGB = true;
export const ColorConversions = wgsl`
#if ${APPROXIMATE_SRGB}
  // linear <-> sRGB approximations
  // see http://chilliant.blogspot.com/2012/08/srgb-approximations-for-hlsl.html
  let GAMMA = 2.2;
  fn linearTosRGB(linear : vec3<f32>) -> vec3<f32> {
    let INV_GAMMA = 1.0 / GAMMA;
    return pow(linear, vec3<f32>(INV_GAMMA, INV_GAMMA, INV_GAMMA));
  }

  fn sRGBToLinear(srgb : vec3<f32>) -> vec3<f32> {
    return pow(srgb, vec3<f32>(GAMMA, GAMMA, GAMMA));
  }
#else
  // linear <-> sRGB conversions
  fn linearTosRGB(linear : vec3<f32>) -> vec3<f32> {
    if (all(linear <= vec3<f32>(0.0031308, 0.0031308, 0.0031308))) {
      return linear * 12.92;
    }
    return (pow(abs(linear), vec3<f32>(1.0/2.4, 1.0/2.4, 1.0/2.4)) * 1.055) - vec3<f32>(0.055, 0.055, 0.055);
  }

  fn sRGBToLinear(srgb : vec3<f32>) -> vec3<f32> {
    if (all(srgb <= vec3<f32>(0.04045, 0.04045, 0.04045))) {
      return srgb / vec3<f32>(12.92, 12.92, 12.92);
    }
    return pow((srgb + vec3<f32>(0.055, 0.055, 0.055)) / vec3<f32>(1.055, 1.055, 1.055), vec3<f32>(2.4, 2.4, 2.4));
  }
#endif
`;

export const FullscreenTexturedQuadVertexSource = `
  var<private> pos : array<vec2<f32>, 3> = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(-1.0, 3.0), vec2<f32>(3.0, -1.0));

  struct VertexInput {
    [[builtin(vertex_index)]] vertexIndex : u32;
  };

  struct VertexOutput {
    [[builtin(position)]] position : vec4<f32>;
    [[location(0)]] texCoord : vec2<f32>;
  };

  [[stage(vertex)]]
  fn vertexMain(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;

    output.position = vec4<f32>(pos[input.vertexIndex], 1.0, 1.0);
    output.texCoord = pos[input.vertexIndex] * 0.5 + 0.5;
    output.texCoord.y = output.texCoord.y * -1.0;

    return output;
  }
`;

export const TextureDebugFragmentSource = `
struct FragmentInput {
  [[location(0)]] texCoord : vec2<f32>;
};

[[group(0), binding(0)]] var debugTexture: texture_2d<f32>;
[[group(0), binding(1)]] var debugSampler: sampler;

[[stage(fragment)]]
fn fragmentMain(input : FragmentInput) -> [[location(0)]] vec4<f32> {
  let color = textureSample(debugTexture, debugSampler, input.texCoord);
  return color;
}
`;

export const ShadowDebugFragmentSource = `
struct FragmentInput {
  [[location(0)]] texCoord : vec2<f32>;
};

[[group(0), binding(0)]] var shadowTexture: texture_depth_2d;
[[group(0), binding(1)]] var shadowSampler: sampler;

[[stage(fragment)]]
fn fragmentMain(input : FragmentInput) -> [[location(0)]] vec4<f32> {
  let shadowDepth = textureSample(shadowTexture, shadowSampler, input.texCoord);
  return vec4<f32>(shadowDepth, shadowDepth, shadowDepth, 1.0);
}
`;