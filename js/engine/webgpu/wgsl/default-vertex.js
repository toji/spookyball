import { wgsl } from './wgsl-utils.js';
import { AttributeLocation } from '../../core/mesh.js';
import { CameraStruct, SkinStructs, GetSkinMatrix, DefaultVertexInput, DefaultVertexOutput, GetInstanceMatrix } from './common.js';

export function DefaultVertexSource(layout, skinned = false) { return wgsl`
  ${DefaultVertexInput(layout)}
  ${DefaultVertexOutput(layout)}

  ${CameraStruct()}

  ${GetInstanceMatrix}

#if ${skinned}
  ${SkinStructs(2)}
  ${GetSkinMatrix}
#endif

  [[stage(vertex)]]
  fn vertexMain(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;

#if ${skinned}
    let modelMatrix = getInstanceMatrix(input) * getSkinMatrix(input);
#else
    let modelMatrix = getInstanceMatrix(input);
#endif

#if ${layout.locationsUsed.includes(AttributeLocation.normal)}
    output.normal = normalize((modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
#else
    output.normal = normalize((modelMatrix * vec4<f32>(0.0, 0.0, 1.0, 0.0)).xyz);
#endif

#if ${layout.locationsUsed.includes(AttributeLocation.tangent)}
    output.tangent = normalize((modelMatrix * vec4<f32>(input.tangent.xyz, 0.0)).xyz);
    output.bitangent = cross(output.normal, output.tangent) * input.tangent.w;
#endif

#if ${layout.locationsUsed.includes(AttributeLocation.color)}
    output.color = input.color;
#else
    output.color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
#endif

#if ${layout.locationsUsed.includes(AttributeLocation.texcoord)}
    output.texcoord = input.texcoord;
#endif
#if ${layout.locationsUsed.includes(AttributeLocation.texcoord2)}
    output.texcoord2 = input.texcoord2;
#endif

    output.instanceColor = input.instanceColor;

    let modelPos = modelMatrix * input.position;
    output.worldPos = modelPos.xyz;
    output.view = camera.position - modelPos.xyz;
    output.position = camera.projection * camera.view * modelPos;
    return output;
  }`;
}
