import { System } from './engine/core/ecs.js';
import { InstanceColor } from './engine/core/instance-color.js';
import { Health } from './lifetime.js';

export class ImpactDamage {
  constructor(value = 1) {
    this.damage = value;
  }
}

export class Collisions {
  entities = new Set();
}

const FLASH_DURATION = 0.1;

export class Damaged {
  duration = FLASH_DURATION;
  amount = 0;
}

export class ImpactDamageSystem extends System {
  init() {
    this.impactDamageQuery = this.query(ImpactDamage, Collisions);
    this.damagedQuery = this.query(Damaged);
  }

  execute(delta) {
    // Accumulate damage from all colliders that inflict impact damage
    this.impactDamageQuery.forEach((entity, damage, collisions) => {
      for (const colliderEntity of collisions.entities) {
        const colliderHealth = colliderEntity.get(Health);
        if (colliderHealth) {
          colliderHealth.health -= damage.damage;

          let damaged = colliderEntity.get(Damaged);
          if (!damaged) {
            damaged = new Damaged();
            colliderEntity.add(damaged);
          }
          damaged.duration = FLASH_DURATION;
          damaged.amount += damage.damage;
        }
      }
    });

    // Give each mesh a flash effect to indicate that it's been damaged.
    this.damagedQuery.forEach((entity, damaged) => {
      if (damaged.duration <= 0) {
        entity.remove(InstanceColor);
        entity.remove(Damaged);
        return;
      }

      let flash = entity.get(InstanceColor);
      if (!flash) {
        flash = new InstanceColor();
        entity.add(flash);
      }

      const t = (1.0 - (damaged.duration / FLASH_DURATION)) * 0.75 + 0.25;

      flash.color[0] = Math.sin(t * Math.PI) * 0.6;
      flash.color[1] = Math.sin(t * Math.PI) * 0.6;
      flash.color[2] = Math.sin(t * Math.PI) * 0.4;

      damaged.duration -= delta;
    });
  }
}
