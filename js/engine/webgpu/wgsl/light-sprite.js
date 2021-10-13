import { CameraStruct, LightStruct, ColorConversions } from './common.js';

export const LightSpriteVertexSource = `
  var<private> pos : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0)
  );

  ${CameraStruct(0, 0)}
  ${LightStruct(0, 1)}

  struct VertexInput {
    [[builtin(vertex_index)]] vertexIndex : u32;
    [[builtin(instance_index)]] instanceIndex : u32;
  };

  struct VertexOutput {
    [[builtin(position)]] position : vec4<f32>;
    [[location(0)]] localPos : vec2<f32>;
    [[location(1)]] color: vec3<f32>;
  };

  [[stage(vertex)]]
  fn vertexMain(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;

    let light = &globalLights.lights[input.instanceIndex];

    output.localPos = pos[input.vertexIndex];
    output.color = (*light).color * (*light).intensity;
    let worldPos = vec3<f32>(output.localPos, 0.0) * (*light).range * 0.025;

    // Generate a billboarded model view matrix
    var bbModelViewMatrix : mat4x4<f32>;
    bbModelViewMatrix[3] = vec4<f32>((*light).position, 1.0);
    bbModelViewMatrix = camera.view * bbModelViewMatrix;
    bbModelViewMatrix[0][0] = 1.0;
    bbModelViewMatrix[0][1] = 0.0;
    bbModelViewMatrix[0][2] = 0.0;

    bbModelViewMatrix[1][0] = 0.0;
    bbModelViewMatrix[1][1] = 1.0;
    bbModelViewMatrix[1][2] = 0.0;

    bbModelViewMatrix[2][0] = 0.0;
    bbModelViewMatrix[2][1] = 0.0;
    bbModelViewMatrix[2][2] = 1.0;

    output.position = camera.projection * bbModelViewMatrix * vec4<f32>(worldPos, 1.0);
    return output;
  }
`;

export const LightSpriteFragmentSource = `
  ${ColorConversions}

  struct FragmentInput {
    [[location(0)]] localPos : vec2<f32>;
    [[location(1)]] color: vec3<f32>;
  };

  [[stage(fragment)]]
  fn fragmentMain(input : FragmentInput) -> [[location(0)]] vec4<f32> {
    let distToCenter = length(input.localPos);
    let fade = (1.0 - distToCenter) * (1.0 / (distToCenter * distToCenter));
    return vec4<f32>(linearTosRGB(input.color * fade), fade);
  }
`;