class Entity {
  #worldData;
  #destroyed = false;
  enabled = true;
  name; // Just for debugging

  constructor(worldData, entityId) {
    this.id = entityId;
    this.#worldData = worldData;
  }

  add(...components) {
    if (this.#destroyed) {
      throw new Error(`Entity ${id} has been destroyed`);
    }

    for (const component of components) {
      let componentSet = this.#worldData.components.get(component.constructor);
      if (componentSet === undefined) {
        componentSet = new Map();
        this.#worldData.components.set(component.constructor, componentSet);
      }
      componentSet.set(this.id, component);
      component.addedToEntity?.(this);
    }

    return this;
  }

  remove(componentType) {
    const componentSet = this.#worldData.components.get(componentType);
    if (!componentSet) { return undefined; }
    const component = componentSet.get(this.id);
    if (!component) { return undefined; }
    componentSet.delete(this.id);
    component.removedFromEntity?.(this);
    return component;
  }

  has(componentType) {
    const componentSet = this.#worldData.components.get(componentType);
    return componentSet !== undefined && componentSet.get(this.id) !== undefined;
  }

  get(componentType) {
    const componentSet = this.#worldData.components.get(componentType);
    return componentSet !== undefined ? componentSet.get(this.id) : undefined;
  }

  destroy() {
    this.#worldData.entities.delete(this);
    this.#destroyed = true;
    for (const componentSet of this.#worldData.components.values()) {
      const component = componentSet.get(this.id);
      if (component) {
        componentSet.delete(this.id);
        component.removedFromEntity?.(this);
      }
    }
  }
}

const tags = new Map();
export function Tag(name) {
  let tagInstance = tags.get(name);
  if (!tagInstance) {
    const className = `Tag__${name}__`;
    const tagClass = {[className]: class {
      isTag = true;
      name = name;
    }}[className];
    tagClass.constructor = tagClass;
    tagInstance = tagClass;
    tags.set(name, tagInstance);
  }
  return tagInstance;
}

class SingletonEntity extends Entity {
  destroy() {
    throw new Error('The singleton entity cannot be destroyed');
  }
}

function getComponentName(component) {
  return component.name ?? component.constructor.name;
}

class WorldData {
  entities = new Map();
  components = new Map();
  queries = new Map();
  systems = new Map();
  orderedSystems = new Array();

  getQuery(componentTypes) {
    let componentNames = [];
    for(const type of componentTypes) {
      componentNames.push(getComponentName(type));
    }
    const queryName = componentNames.join(':');
    const cachedQuery = this.queries.get(queryName);
    if (cachedQuery !== undefined) { return cachedQuery; }
    return new Query(this, queryName, componentTypes);
  }
}

export class World {
  #worldData = new WorldData();
  #nextEntityId = 1;
  #nextSystemId = 1;
  #singletonEntity;
  #lastTime = performance.now() / 1000;

  timeScale = 1.0;
  fixedStepEpsilon = 0.001;
  paused = false;

  constructor() {
    // Singleton entity is not added to the global list of entities.
    this.#singletonEntity = new SingletonEntity(this.#worldData, 0);
  }

  get entities() {
    return this.#worldData.entities.values();
  }

  get singleton() {
    return this.#singletonEntity;
  }

  create(...components) {
    const id = this.#nextEntityId++;
    const entity = new Entity(this.#worldData, id);
    entity.add(...components);
    this.#worldData.entities.set(id, entity);
    return entity;
  }

  registerSystem(systemType, ...initArgs) {
    const system = new systemType(this, this.#worldData);
    system.id = this.#nextSystemId++;
    this.#worldData.systems.set(systemType, system);
    this.#worldData.orderedSystems.push(system);
    this.#worldData.orderedSystems.sort((a, b) => {
      // Go by the explicitly set stage first.
      let order = a.stage - b.stage;
      if (order == 0) {
        // If the stages match, use the order of addition instead.
        order = a.id - b.id;
      }
      return order;
    });
    if (system.init !== undefined) {
      system.init(...initArgs);
    }
    return this;
  }

  removeSystem(systemType) {
    const system = this.#worldData.systems.get(systemType);
    if (system) {
      this.#worldData.systems.delete(systemType, system);
      const index = this.#worldData.orderedSystems.indexOf(system);
      if (index > -1) {
        this.#worldData.orderedSystems.splice(index, 1);
      }
    }
    return this;
  }

  getSystem(systemType) {
    return this.#worldData.systems.get(systemType);
  }

  clear() {
    for (const entity of this.#worldData.entities.values()) {
      entity.destroy();
    }
  }

  query(...componentTypes) {
    return this.#worldData.getQuery(componentTypes);
  }

  execute(delta, time, ...args) {
    if (!delta) {
      time = performance.now() / 1000;
      delta = time - this.#lastTime;
      this.#lastTime = time;

      // Long gaps are assumed to be the result of some pause of processing on
      // the page. To prevent massive jumps in the simulation time, any time we
      // see an abnormally large delta we'll quietly skip a frame to get us back
      // on track with a more sensible #lastTime.
      if (delta > 1) {
        return;
      }
    }

    delta *= this.timeScale;

    for (const system of this.#worldData.orderedSystems) {
      if (system.enabled && (!this.paused || system.executesWhenPaused)) {
        if (system.fixedStep === 0) {
          system.execute(delta, time, ...args);
        } else {
          let fixedStepDelta = system.fixedStepDeltaRemainder + delta;
          while (fixedStepDelta+this.fixedStepEpsilon >= system.fixedStep) {
            system.execute(system.fixedStep, time, ...args);
            fixedStepDelta -= system.fixedStep;
          }
          system.fixedStepDeltaRemainder = fixedStepDelta;
        }
      }
    }
  }
}

export class System {
  #worldData;
  enabled = true;
  stage = 0;
  id = 0;
  executesWhenPaused = true;
  fixedStep = 0;
  fixedStepDeltaRemainder = 0;

  constructor(world, worldData) {
    this.world = world;
    this.#worldData = worldData;
  }

  query(...componentTypes) {
    return this.#worldData.getQuery(componentTypes);
  }

  get singleton() {
    return this.world.singleton;
  }

  execute(delta, time) {}
}

class Query {
  #worldData;
  #includeDisabled;

  constructor(worldData, queryName, includedTypes, excludedTypes = [], includeDisabled=false) {
    this.#worldData = worldData;
    this.queryName = queryName;
    this.#worldData.queries.set(queryName, this);

    this.include = includedTypes;
    this.exclude = excludedTypes;
    this.#includeDisabled = includeDisabled;

    // Sanity check to ensure you don't end up with invalid queries
    for (const type of excludedTypes) {
      if (includedTypes.includes(type)) {
        throw new Error(`Component type "${getComponentName(type)}" cannot be both included and excluded in the same query.`);
      }
    }
  }

  not(...componentTypes) {
    let componentNames = [];
    for(const type of componentTypes) {
      componentNames.push(getComponentName(type));
    }
    const queryName = this.queryName + '!' + componentNames.join(':!');
    const cachedQuery = this.#worldData.queries.get(queryName);
    if (cachedQuery !== undefined) { return cachedQuery; }
    return new Query(this.#worldData, queryName, this.include, this.exclude.concat(componentTypes), this.#includeDisabled);
  }

  includeDisabled() {
    const queryName = this.queryName + '+disabled';
    const cachedQuery = this.#worldData.queries.get(queryName);
    if (cachedQuery !== undefined) { return cachedQuery; }
    return new Query(this.#worldData, queryName, this.include, this.exclude, true);
  }

  forEach(callback) {
    const args = new Array(this.include.length);

    let queryEntities;
    for (let i = 0; i < this.include.length; ++i) {
      const componentType = this.include[i];
      const componentSet = this.#worldData.components.get(componentType);
      const componentEntities = Array.from(componentSet?.keys() || []);

      if (i == 0) {
        queryEntities = componentEntities;
      } else {
        queryEntities = queryEntities.filter(entityId => componentEntities.includes(entityId));
      }

      // Early out if we've reduced the entity set to zero.
      if (queryEntities.length === 0) {
        return;
      }
    }

    for (const entityId of queryEntities) {
      const entity = this.#worldData.entities.get(entityId);
      if (!this.#includeDisabled && !entity.enabled) { continue; }

      let excluded = false;
      for (const componentId of this.exclude) {
        if (entity.has(componentId)) {
          excluded = true;
          break;
        }
      }
      if (excluded) { continue; }

      for (let i = 0; i < this.include.length; ++i) {
        args[i] = entity.get(this.include[i]);
      }

      const keepIterating = callback(entity, ...args);
      if (keepIterating === false) { return; }
    }
  }

  // Just gets the count of how many entities this query would return. Generally don't call this
  // unless the ONLY thing you care about is how many of something there are in the world. If you
  // actually want to do anything with the entities queried just call forEach and increment a
  // counter for each entity.
  getCount() {
    let queryEntities;
    for (let i = 0; i < this.include.length; ++i) {
      const componentType = this.include[i];
      const componentSet = this.#worldData.components.get(componentType);
      const componentEntities = Array.from(componentSet?.keys() || []);

      if (i == 0) {
        queryEntities = componentEntities;
      } else {
        queryEntities = queryEntities.filter(entityId => componentEntities.includes(entityId));
      }

      // Early out if we've reduced the entity set to zero.
      if (queryEntities.length === 0) {
        return 0;
      }
    }

    let count = 0;

    for (const entityId of queryEntities) {
      const entity = this.#worldData.entities.get(entityId);
      if (!this.#includeDisabled && !entity.enabled) { continue; }

      let excluded = false;
      for (const componentId of this.exclude) {
        if (entity.has(componentId)) {
          excluded = true;
          break;
        }
      }
      if (excluded) { continue; }

      count++;
    }
    return count;
  }
}
