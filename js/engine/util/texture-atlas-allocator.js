// Very simple BSP allocator. Ported from some ancient Quake 2 rendering code that I did.
class TextureAtlasRect {
  #node;

  constructor(node) {
    this.#node = node;
  }

  get x() { return this.#node?.x; }
  get y() { return this.#node?.y; }
  get width() { return this.#node?.width; }
  get height() { return this.#node?.height; }

  release() {
    if (this.#node) {
      this.#node.onRelease();
      this.#node = null;
    }
  }
}

class TextureAtlasNode {
  allocated = false;
  children = null;
  rect = null;

  constructor(x, y, width, height, parent) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.parent = parent;
  }

  get fullyAllocated() {
    if (this.children) {
      return this.children[0].fullyAllocated && this.children[1].fullyAllocated;
    }
    return this.rect;
  }

  get hasAllocation() {
    if (this.children) {
      return this.children[0].hasAllocation || this.children[1].hasAllocation;
    }
    return this.rect;
  }

  allocate() {
    if (!this.rect) {
      if (this.children) {
        throw new Error('Split nodes cannot be allocated.');
      }
      this.rect = new TextureAtlasRect(this);
    }
    return this.rect;
  }

  split(width, height) {
    if (this.children) {
      throw new Error('Node is already split.');
    }
    if((this.width - width) > (this.height - height)) {
      // Horizontal split
      this.children = [
        new TextureAtlasNode(this.x, this.y, width, this.height, this),
        new TextureAtlasNode(this.x+width, this.y, this.width - width, this.height, this)
      ];
    } else {
      // Vertical split
      this.children = [
        new TextureAtlasNode(this.x, this.y, this.width, height, this),
        new TextureAtlasNode(this.x, this.y+height, this.width, this.height - height, this)
      ];
    }
  }

  onRelease() {
    this.rect = null;
    this.children = null;

    // When a node is released, check to see if it's parent node can also be released, which
    // collapses a split node into a single bigger node.
    if (this.parent && !this.parent.hasAllocation) {
      this.parent.onRelease();
    }
  }
}

export class TextureAtlasAllocator {
  #root;

  constructor(width, height) {
    this.#root = new TextureAtlasNode(0, 0, width, height || width);
  }

  #findNodeToAllocate(node, width, height) {
    // Node is too small for the required size.
    if (node.width < width || node.height < height) {
      return null;
    }

    // Already used
    if (node.fullyAllocated) { return null; }

    // Check children nodes
    if (node.children) {
      var retNode = this.#findNodeToAllocate(node.children[0], width, height);
      return retNode || this.#findNodeToAllocate(node.children[1], width, height);
    }

    // Perfect fit. Allocate without splitting
    if(node.width == width && node.height == height) {
      return node;
    }

    node.split(width, height);
    return this.#findNodeToAllocate(node.children[0], width, height);
  } 

  allocate(width, height) {
    let node = this.#findNodeToAllocate(this.#root, width, height || width);
    return node?.allocate();
  }
}