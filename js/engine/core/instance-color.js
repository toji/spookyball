const InstanceColorMode = {
  Add: 0,
  Multiply: 1,
};

export class InstanceColor {
  buffer = new Float32Array(4);
  color = new Float32Array(this.buffer.buffer, 0, 3);

  constructor(color, mode = InstanceColorMode.Add) {
    if (color) {
      this.color.set(color);
    }
    this.buffer[3] = mode;
  }
}