importScripts('https://www.gstatic.com/draco/versioned/decoders/1.4.1/draco_decoder_gltf.js');

const DRACO_DECODER = new Promise((resolve) => {
  DracoDecoderModule({
    onModuleLoaded: (draco) => {
      resolve(draco);
    }
  });
});

let draco;
let decoder;

async function ensureInitalized() {
  if (!draco) {
    draco = await DRACO_DECODER;
  }

  if (!decoder) {
    decoder = new draco.Decoder();
  }
}

function fail(id, errorMsg) {
  postMessage({
    id: id,
    error: errorMsg,
  });
}

onmessage = async function(msg) {
  await ensureInitalized();

  const id = msg.data.id;
  const dracoBuffer = new Int8Array(msg.data.buffer);
  const dracoAttributes = msg.data.attributes;
  const indexSize = msg.data.indexSize;

  const geometryType = decoder.GetEncodedGeometryType(dracoBuffer);

  let geometry;
  let status;
  switch (geometryType) {
    case draco.POINT_CLOUD: {
      geometry = new draco.PointCloud();
      status = decoder.DecodeArrayToPointCloud(dracoBuffer, dracoBuffer.byteLength, geometry);
      break;
    }
    case draco.TRIANGULAR_MESH: {
      geometry = new draco.Mesh();
      status = decoder.DecodeArrayToMesh(dracoBuffer, dracoBuffer.byteLength, geometry);
      break;
    }
    default:
      return fail(id, 'Unknown Draco geometry type');
  }

  if (!status.ok()) {
    return fail(id, 'Draco decode failed');
  }

  const resultBufferViews = {};

  const vertCount = geometry.num_points();

  for (const name in dracoAttributes) {
    const attributeId = dracoAttributes[name];
    const attribute = decoder.GetAttributeByUniqueId(geometry, attributeId);
    const stride = attribute.byte_stride();
    const byteLength = vertCount * stride;

    const outPtr = draco._malloc(byteLength);
    const success = decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, attribute.data_type(), byteLength, outPtr);
    if (!success) {
      return fail(id, 'Failed to get decoded attribute data array');
    }

    resultBufferViews[name] = {
      // Copy the decoded attribute data out of the WASM heap.
      buffer: new Uint8Array(draco.HEAPF32.buffer, outPtr, byteLength).slice().buffer,
      stride,
    };

    draco._free(outPtr);
  }

  if (geometryType == draco.TRIANGULAR_MESH && indexSize) {
    const indexCount = geometry.num_faces() * 3;
    const byteLength = indexCount * indexSize;

    const outPtr = draco._malloc(byteLength);
    let success;
    if (indexSize == 4) {
      success = decoder.GetTrianglesUInt32Array(geometry, byteLength, outPtr);
    } else {
      success = decoder.GetTrianglesUInt16Array(geometry, byteLength, outPtr);
    }

    if (!success) {
      return fail(id, 'Failed to get decoded index data array');
    }

    resultBufferViews.INDICES = {
      // Copy the decoded index data out of the WASM heap.
      buffer: new Uint8Array(draco.HEAPF32.buffer, outPtr, byteLength).slice().buffer,
      stride: indexSize,
    };

    draco._free(outPtr);
  }

  const transferBuffers = [];
  for (const name in resultBufferViews) {
    transferBuffers.push(resultBufferViews[name].buffer);
  }

  postMessage({
    id,
    buffersViews: resultBufferViews,
  }, transferBuffers);
}