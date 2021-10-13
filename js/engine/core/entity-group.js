import { System } from './ecs.js';

// An EntityGroup is a component which contains a list of other entities. When the entity containing
// the group is enabled or disabled, all of the entities in the EntityGroup also get enabled or
// disabled.
export class EntityGroup {
  entities = [];
  refCount = 0;

  addedToEntity(entity) {
    this.refCount++;
  }

  removedFromEntity(entity) {
    this.refCount--;
    if (this.refCount == 0) {
      for (const entity of this.entities) {
        entity.destroy();
      }
    }
  }
}

export class EntityGroupSystem extends System {
  prevEnabledState = new WeakMap();

  init() {
    this.groupQuery = this.query(EntityGroup).includeDisabled();
  }

  execute() {
    this.groupQuery.forEach((entity, group) => {
      const wasEnabled = !!this.prevEnabledState.get(entity);
      if (entity.enabled != wasEnabled) {
        for (const child of group.entities) {
          child.enabled = entity.enabled;
        }
        this.prevEnabledState.set(entity, entity.enabled);
      }
    });
  }
}