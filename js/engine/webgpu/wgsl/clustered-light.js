import { CameraStruct, LightStruct } from './common.js';

export const TILE_COUNT = [32, 18, 48];
export const TOTAL_TILES = TILE_COUNT[0] * TILE_COUNT[1] * TILE_COUNT[2];

const WORKGROUP_SIZE = [4, 2, 4];
export const DISPATCH_SIZE = [
  TILE_COUNT[0] / WORKGROUP_SIZE[0],
  TILE_COUNT[1] / WORKGROUP_SIZE[1],
  TILE_COUNT[2] / WORKGROUP_SIZE[2]]

// Cluster x, y, z size * 32 bytes per cluster.
export const CLUSTER_BOUNDS_SIZE = TOTAL_TILES * 32;

// Each cluster tracks up to MAX_LIGHTS_PER_CLUSTER light indices (ints) and one light count.
// This limitation should be able to go away when we have atomic methods in WGSL.
export const MAX_LIGHTS_PER_CLUSTER = 256;
export const MAX_CLUSTERED_LIGHTS = TOTAL_TILES * 64;
export const CLUSTER_LIGHTS_SIZE = 4 + (8 * TOTAL_TILES) + (4 * MAX_CLUSTERED_LIGHTS);

export function ClusterStruct(group, binding, access = 'read') { return `
  struct ClusterBounds {
    minAABB : vec3<f32>,
    maxAABB : vec3<f32>,
  };
  struct Clusters {
    bounds : array<ClusterBounds, ${TOTAL_TILES}>
  };
  @group(${group}) @binding(${binding}) var<storage, ${access}> clusters : Clusters;
`;
}

export function ClusterLightsStruct(group=0, binding=2, access='read') { return `
  struct ClusterLights {
    offset : u32,
    count : u32,
  };
  struct ClusterLightGroup {
    offset : ${access == 'read' ? 'u32' : 'atomic<u32>'},
    lights : array<ClusterLights, ${TOTAL_TILES}>,
    indices : array<u32, ${MAX_CLUSTERED_LIGHTS}>,
  };
  @group(${group}) @binding(${binding}) var<storage, ${access}> clusterLights : ClusterLightGroup;
`;
}

export const TileFunctions = `
const tileCount = vec3(${TILE_COUNT[0]}u, ${TILE_COUNT[1]}u, ${TILE_COUNT[2]}u);

fn linearDepth(depthSample : f32) -> f32 {
  return camera.zFar * camera.zNear / fma(depthSample, camera.zNear-camera.zFar, camera.zFar);
}

fn getTile(fragCoord : vec4<f32>) -> vec3<u32> {
  // TODO: scale and bias calculation can be moved outside the shader to save cycles.
  let sliceScale = f32(tileCount.z) / log2(camera.zFar / camera.zNear);
  let sliceBias = -(f32(tileCount.z) * log2(camera.zNear) / log2(camera.zFar / camera.zNear));
  let zTile = u32(max(log2(linearDepth(fragCoord.z)) * sliceScale + sliceBias, 0.0));

  return vec3(u32(fragCoord.x / (camera.outputSize.x / f32(tileCount.x))),
              u32(fragCoord.y / (camera.outputSize.y / f32(tileCount.y))),
              zTile);
}

fn getClusterIndex(fragCoord : vec4<f32>) -> u32 {
  let tile = getTile(fragCoord);
  return tile.x +
         tile.y * tileCount.x +
         tile.z * tileCount.x * tileCount.y;
}
`;

export const ClusterBoundsSource = `
  ${CameraStruct(0, 0)}
  ${ClusterStruct(1, 0, 'write')}

  fn lineIntersectionToZPlane(a : vec3<f32>, b : vec3<f32>, zDistance : f32) -> vec3<f32> {
    let normal = vec3(0.0, 0.0, 1.0);
    let ab =  b - a;
    let t = (zDistance - dot(normal, a)) / dot(normal, ab);
    return a + t * ab;
  }

  fn clipToView(clip : vec4<f32>) -> vec4<f32> {
    let view = camera.inverseProjection * clip;
    return view / vec4(view.w, view.w, view.w, view.w);
  }

  fn screen2View(screen : vec4<f32>) -> vec4<f32> {
    let texCoord = screen.xy / camera.outputSize.xy;
    let clip = vec4(vec2(texCoord.x, 1.0 - texCoord.y) * 2.0 - vec2(1.0, 1.0), screen.z, screen.w);
    return clipToView(clip);
  }

  const tileCount = vec3(${TILE_COUNT[0]}u, ${TILE_COUNT[1]}u, ${TILE_COUNT[2]}u);
  const eyePos = vec3(0.0);

  @compute @workgroup_size(${WORKGROUP_SIZE[0]}, ${WORKGROUP_SIZE[1]}, ${WORKGROUP_SIZE[2]})
  fn computeMain(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let tileIndex : u32 = global_id.x +
                          global_id.y * tileCount.x +
                          global_id.z * tileCount.x * tileCount.y;

    let tileSize = vec2(camera.outputSize.x / f32(tileCount.x),
                        camera.outputSize.y / f32(tileCount.y));

    let maxPoint_sS = vec4(vec2(f32(global_id.x+1u), f32(global_id.y+1u)) * tileSize, 0.0, 1.0);
    let minPoint_sS = vec4(vec2(f32(global_id.x), f32(global_id.y)) * tileSize, 0.0, 1.0);

    let maxPoint_vS = screen2View(maxPoint_sS).xyz;
    let minPoint_vS = screen2View(minPoint_sS).xyz;

    let tileNear : f32 = -camera.zNear * pow(camera.zFar/ camera.zNear, f32(global_id.z)/f32(tileCount.z));
    let tileFar : f32 = -camera.zNear * pow(camera.zFar/ camera.zNear, f32(global_id.z+1u)/f32(tileCount.z));

    let minPointNear = lineIntersectionToZPlane(eyePos, minPoint_vS, tileNear);
    let minPointFar = lineIntersectionToZPlane(eyePos, minPoint_vS, tileFar);
    let maxPointNear = lineIntersectionToZPlane(eyePos, maxPoint_vS, tileNear);
    let maxPointFar = lineIntersectionToZPlane(eyePos, maxPoint_vS, tileFar);

    clusters.bounds[tileIndex].minAABB = min(min(minPointNear, minPointFar),min(maxPointNear, maxPointFar));
    clusters.bounds[tileIndex].maxAABB = max(max(minPointNear, minPointFar),max(maxPointNear, maxPointFar));
  }
`;

export const ClusterLightsSource = `
  ${CameraStruct(0, 0)}
  ${ClusterStruct(0, 1, 'read')}
  ${ClusterLightsStruct(0, 2, 'read_write')}
  ${LightStruct(0, 3)}

  ${TileFunctions}

  fn sqDistPointAABB(point : vec3<f32>, minAABB : vec3<f32>, maxAABB : vec3<f32>) -> f32 {
    var sqDist = 0.0;
    // const minAABB = clusters.bounds[tileIndex].minAABB;
    // const maxAABB = clusters.bounds[tileIndex].maxAABB;

    // Wait, does this actually work? Just porting code, but it seems suspect?
    for(var i : i32 = 0; i < 3; i = i + 1) {
      let v = point[i];
      if(v < minAABB[i]){
        sqDist = sqDist + (minAABB[i] - v) * (minAABB[i] - v);
      }
      if(v > maxAABB[i]){
        sqDist = sqDist + (v - maxAABB[i]) * (v - maxAABB[i]);
      }
    }

    return sqDist;
  }

  @compute @workgroup_size(${WORKGROUP_SIZE[0]}, ${WORKGROUP_SIZE[1]}, ${WORKGROUP_SIZE[2]})
  fn computeMain(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let tileIndex = global_id.x +
                    global_id.y * tileCount.x +
                    global_id.z * tileCount.x * tileCount.y;

    // TODO: Look into improving threading using local invocation groups?
    var clusterLightCount = 0u;
    var cluserLightIndices : array<u32, ${MAX_LIGHTS_PER_CLUSTER}>;
    for (var i = 0u; i < globalLights.lightCount; i = i + 1u) {
      let range = globalLights.lights[i].range;
      // Lights without an explicit range affect every cluster, but this is a poor way to handle that.
      var lightInCluster : bool = range <= 0.0;

      if (!lightInCluster) {
        let lightViewPos = camera.view * vec4(globalLights.lights[i].position, 1.0);
        let sqDist = sqDistPointAABB(lightViewPos.xyz, clusters.bounds[tileIndex].minAABB, clusters.bounds[tileIndex].maxAABB);
        lightInCluster = sqDist <= (range * range);
      }

      if (lightInCluster) {
        // Light affects this cluster. Add it to the list.
        cluserLightIndices[clusterLightCount] = i;
        clusterLightCount = clusterLightCount + 1u;
      }

      if (clusterLightCount == ${MAX_LIGHTS_PER_CLUSTER}u) {
        break;
      }
    }

    // TODO: Stick a barrier here and track cluster lights with an offset into a global light list
    let lightCount = clusterLightCount;
    var offset = atomicAdd(&clusterLights.offset, lightCount);

    if (offset >= ${MAX_CLUSTERED_LIGHTS}u) {
        return;
    }

    for(var i = 0u; i < clusterLightCount; i = i + 1u) {
      clusterLights.indices[offset + i] = cluserLightIndices[i];
    }
    clusterLights.lights[tileIndex].offset = offset;
    clusterLights.lights[tileIndex].count = clusterLightCount;
  }
`;