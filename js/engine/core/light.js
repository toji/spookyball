import { System } from './ecs.js';
import { vec3 } from 'gl-matrix';
import { Transform } from './transform.js';

export class PointLight {
  lightIndex = -1;
  color = new Float32Array(3);

  constructor(options) {
    this.color.set(options?.color || [1, 1, 1]);
    this.intensity = options?.intensity || 1;
    this.range = options?.range || -1;
  }

  get computedRange() {
    const lightRadius = 0.05;
    const illuminationThreshold = 0.001;
    return lightRadius * (Math.sqrt(this.intensity/illuminationThreshold) - 1);
  }
}

// TODO: Not currently functional
export class SpotLight {
  lightIndex = -1;
  color = new Float32Array(3);

  constructor(options) {
    this.color.set(options?.color || [1, 1, 1]);
    this.intensity = options?.intensity || 1;
    this.range = options?.range || -1;
    this.angle = options?.angle || Math.PI / 3;
  }
}

export class DirectionalLight {
  color = new Float32Array(3);
  direction = new Float32Array(3);

  constructor(options) {
    this.color.set(options?.color || [1, 1, 1]);
    this.intensity = options?.intensity || 1;
    this.direction.set(options?.direction || [0, 1, 0]);
  }
}

export class ShadowCastingLight {
  up = new Float32Array(3);

  constructor(options) {
    this.textureSize = options.textureSize || 512; // For a point light this would be per-side
    this.zNear = options.zNear || 1.0;
    this.zFar = options.zFar || 128.0;

    // Only applies to directional light
    this.width = options.width || 10;
    this.height = options.height || 10;
    this.up.set(options.up || [0, 1, 0]);
  }
}

export class AmbientLight {
  color = new Float32Array(3);

  constructor(r = 0.1, g = 0.1, b = 0.1) {
    this.color[0] = r;
    this.color[1] = g;
    this.color[2] = b;
  }
}

const AMBIENT_LIGHT_BYTE_SIZE = 4 * Float32Array.BYTES_PER_ELEMENT;
const DIRECTIONAL_LIGHT_BYTE_SIZE = 8 * Float32Array.BYTES_PER_ELEMENT;
const POINT_LIGHT_BYTE_SIZE = 8 * Float32Array.BYTES_PER_ELEMENT;

export class LightBuffer {
  constructor(gpu) {
    const LIGHT_BUFFER_SIZE = AMBIENT_LIGHT_BYTE_SIZE + DIRECTIONAL_LIGHT_BYTE_SIZE + (POINT_LIGHT_BYTE_SIZE * gpu.maxLightCount);
    this.buffer = gpu.createDynamicBuffer(LIGHT_BUFFER_SIZE, 'light');
    this.buffer.finish(); // TODO: That could be more elegant.
    this.lightCount = 0;
  }
}

export class LightSystem extends System {
  init(gpu) {
    this.singleton.add(new LightBuffer(gpu));

    this.ambientLightQuery = this.query(AmbientLight);
    this.directionalLightQuery = this.query(DirectionalLight);
    this.pointLightQuery = this.query(PointLight);
    this.spotLightQuery = this.query(SpotLight);
  }

  execute(delta, time, gpu) {
    const lightBuffer = this.singleton.get(LightBuffer);
    lightBuffer.buffer.beginUpdate();
    const arrayBuffer = lightBuffer.buffer.arrayBuffer;

    // Accumulate all of the ambient lights.
    const ambientColor = new Float32Array(arrayBuffer, 0, 3);
    vec3.set(ambientColor, 0, 0, 0);
    this.ambientLightQuery.forEach((entity, light) => {
      vec3.add(ambientColor, ambientColor, light.color);
    });

    // Get any directional lights.
    const dirColorIntensity = new Float32Array(arrayBuffer, 4 * Float32Array.BYTES_PER_ELEMENT, 4);
    dirColorIntensity[3] = 0;
    this.directionalLightQuery.forEach((entity, light) => {
      vec3.copy(dirColorIntensity, light.color);
      dirColorIntensity[3] = light.intensity; // Intensity

      const dirDirection = new Float32Array(arrayBuffer, 8 * Float32Array.BYTES_PER_ELEMENT, 3);
      vec3.copy(dirDirection, light.direction);

      return false; // Only process the first one.
    });

    let pointLightByteOffset = AMBIENT_LIGHT_BYTE_SIZE + DIRECTIONAL_LIGHT_BYTE_SIZE;
    lightBuffer.lightCount = 0;
    this.pointLightQuery.forEach((entity, light) => {
      if (light.intensity > 0) {
        const positionRange = new Float32Array(arrayBuffer, pointLightByteOffset, 4);
        const colorIntensity = new Float32Array(arrayBuffer, pointLightByteOffset + 4 * Float32Array.BYTES_PER_ELEMENT, 4);

        const transform = entity.get(Transform);
        if (transform) {
          transform.getWorldPosition(positionRange);
        } else {
          // If the light doesn't have a transform position it at the origin.
          vec3.set(positionRange, 0, 0, 0);
        }
        positionRange[3] = light.range >= 0 ? light.range : light.computedRange;

        vec3.copy(colorIntensity, light.color);
        colorIntensity[3] = light.intensity;

        light.lightIndex = lightBuffer.lightCount++;

        pointLightByteOffset += 8 * Float32Array.BYTES_PER_ELEMENT;

        // Stop processing lights if we overflow our max
        if (lightBuffer.lightCount == gpu.maxLightCount) { return false; } 
      } else {
        light.lightIndex = -1;
      }
    });

    this.spotLightQuery.forEach((entity, light) => {
      // TODO
      light.lightIndex = -1;
    });

    const pointlightCountArray = new Uint32Array(arrayBuffer, 11 * Float32Array.BYTES_PER_ELEMENT, 1);
    pointlightCountArray[0] = lightBuffer.lightCount;

    lightBuffer.buffer.finish();
  }
}
