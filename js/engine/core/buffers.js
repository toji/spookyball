export class StaticBuffer {
  #size;
  #usage;

  constructor(size, usage) {
    this.#size = size;
    this.#usage = usage;
  }

  get size() {
    return this.#size;
  }

  get usage() {
    return this.#usage;
  }

  get arrayBuffer() {
    throw new Error('arrayBuffer getter must be overriden in an extended class');
  }

  finish() {
    throw new Error('finish() must be overriden in an extended class');
  }
}

export class DynamicBuffer extends StaticBuffer {
  beginUpdate() {
    throw new Error('beginUpdate() must be overriden in an extended class');
  }
}