import { vec3 } from 'gl-matrix';

export const BoundingVolumeType = {
  Sphere: 0,
  AABB: 1,
}

const ORIGIN = vec3.create();

export class BoundingVolume {
  radius = 0;
  center = vec3.create();
  min;
  max;

  constructor(options = {}) {
    if (options.radius !== undefined) {
      this.type = BoundingVolumeType.Sphere;
      this.radius = options.radius;
      this.center.set(options.center || ORIGIN);
    } else if (options.min && options.max) {
      this.type = BoundingVolumeType.AABB;
      this.min = vec3.clone(options.min);
      this.max = vec3.clone(options.max);

      // Compute the center
      vec3.add(this.center, this.min, this.max);
      vec3.scale(this.center, this.center, 0.5);
      // Compute a bounding radius
      this.radius = vec3.dist(this.center, this.max);
    } else {
      throw new Error('Must provide either a Sphere (radius, center) or AABB (min/max point).');
    }
  }
}
