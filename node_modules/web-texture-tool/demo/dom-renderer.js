import {mat4} from './gl-matrix/src/gl-matrix.js';

export class DOMRenderer {
  constructor() {
    this.canvas = document.createElement('div');
    this.canvas.classList.add('canvas');
  }

  async initialize() {
    this.onCanvasResize(this.canvas.width, this.canvas.height);
    this.canvas.style.transformStyle = 'preserve-3d';
    this.canvas.style.backgroundImage = 'url("textures/checkerboard.png")';
    this.canvas.style.backgroundSize = 'cover';
    //this.canvas.style.perspective = '20px';
  }

  onCanvasResize(width, height) {
    
  }

  initializeTile(tile) {
    tile.img = new Image();
    tile.img.style.width = '2px';
    tile.img.style.height = '2px';
    tile.img.style.position = 'absolute';
    tile.img.style.left = '50%';
    tile.img.style.top = '50%';
    tile.img.addEventListener('error', (err) => {
      console.warn('Image failed to load from URL: ', err);
      tile.img.style.backgroundColor = '#DD0000';
    });
    tile.img.addEventListener('load', (err) => {
      tile.img.style.backgroundColor = '';
    });
    this.canvas.appendChild(tile.img);
  }

  loadTextureFromUrl(tile, url) {
    tile.img.src = url;
    return Promise.resolve(tile.img);
  }

  loadTextureFromFile(tile, file) {
    return Promise.reject(new Error('Unimplemented'));
  }

  onFrame(projectionMat, tiles, delta) {
    for (let tile of tiles) {
      const m = tile.modelView;
      tile.img.style.transform =
        `scale3d(128, 128, 1) matrix3d(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}, ${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}, ${m[12]}, ${m[13]}, ${m[14]}, ${m[15]})`;
    }
  }

  destroy() {
  }
}
