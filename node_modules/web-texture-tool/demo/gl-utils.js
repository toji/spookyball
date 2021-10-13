// Copyright 2020 Brandon Jones
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/**
 * Utilities module
 * Contains various loose functions which are useful to a variety of other modules.
 *
 * @module utilities
 */

/**
 * Callback that receives a size in device pixels
 *
 * @callback PixelSizeCallback
 * @param {number} width - Width in device pixels
 * @param {number} height - Height in device pixels
 */

/**
 * Observes when the given element resizes and calls the callback with the new size of the element in devices pixels
 *
 * @param {object} element - HTMLElement to observe
 * @param {PixelSizeCallback} callback - Callback to call when the element size changes. If the callback returns `false`
 *  resize events will no longer be tracked.
 */
export function observePixelSize(element, callback) {
  if ('ResizeObserver' in window) {
    const use_DPBS = 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;

    // If ResizeObserver is available, set up a listener for whenever the element in question changes size.
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const entry = entries[0];

      // If supported, get the exact size of the element in device pixels, otherwise get a best estimate.
      const pixelWidth = use_DPBS ? entry.devicePixelContentBoxSize[0].inlineSize :
                               Math.round(entry.contentRect.width * devicePixelRatio);
      const pixelHeight = use_DPBS ? entry.devicePixelContentBoxSize[0].blockSize :
                                Math.round(entry.contentRect.height * devicePixelRatio);
      if (callback(pixelWidth, pixelHeight) === false) {
        resizeObserver.disconnect();
      }
    });

    resizeObserver.observe(element);
  } else {
    // If resize observer isn't supported monitor the window resizing and check to see if the element size changes in
    // response to it.
    let prevWidth = element.clientWidth;
    let prevHeight = element.clientHeight;
    const onResize = (event) => {
      if (prevWidth != element.clientWidth || prevHeight != element.clientHeight) {
        prevWidth = element.clientWidth;
        prevHeight = element.clientHeight;

        const pixelWidth = Math.round(element.clientWidth * devicePixelRatio);
        const pixelHeight = Math.round(element.clientHeight * devicePixelRatio);
        if (callback(pixelWidth, pixelHeight) === false) {
          window.removeEventListener('resize', onResize);
        }
      }
    };
    window.addEventListener('resize', onResize);
  }
}

export class Program {
  constructor(gl, vertSrc, fragSrc, attribMap, defines) {
    this._gl = gl;
    this.program = gl.createProgram();
    this.attrib = null;
    this.uniform = null;
    this.defines = {};

    this._firstUse = true;
    this._nextUseCallbacks = [];

    let definesString = '';
    if (defines) {
      for (let define in defines) {
        this.defines[define] = defines[define];
        definesString += `#define ${define} ${defines[define]}\n`;
      }
    }

    this._vertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.attachShader(this.program, this._vertShader);
    gl.shaderSource(this._vertShader, definesString + vertSrc);
    gl.compileShader(this._vertShader);

    this._fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.attachShader(this.program, this._fragShader);
    gl.shaderSource(this._fragShader, definesString + fragSrc);
    gl.compileShader(this._fragShader);

    if (attribMap) {
      this.attrib = {};
      for (let attribName in attribMap) {
        gl.bindAttribLocation(this.program, attribMap[attribName], attribName);
        this.attrib[attribName] = attribMap[attribName];
      }
    }

    gl.linkProgram(this.program);
  }

  onNextUse(callback) {
    this._nextUseCallbacks.push(callback);
  }

  use() {
    let gl = this._gl;

    // If this is the first time the program has been used do all the error checking and
    // attrib/uniform querying needed.
    if (this._firstUse) {
      this._firstUse = false;
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        if (!gl.getShaderParameter(this._vertShader, gl.COMPILE_STATUS)) {
          console.error('Vertex shader compile error: ' + gl.getShaderInfoLog(this._vertShader));
        } else if (!gl.getShaderParameter(this._fragShader, gl.COMPILE_STATUS)) {
          console.error('Fragment shader compile error: ' + gl.getShaderInfoLog(this._fragShader));
        } else {
          console.error('Program link error: ' + gl.getProgramInfoLog(this.program));
        }
        gl.deleteProgram(this.program);
        this.program = null;
      } else {
        if (!this.attrib) {
          this.attrib = {};
          let attribCount = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
          for (let i = 0; i < attribCount; i++) {
            let attribInfo = gl.getActiveAttrib(this.program, i);
            this.attrib[attribInfo.name] = gl.getAttribLocation(this.program, attribInfo.name);
          }
        }

        this.uniform = {};
        let uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        let uniformName = '';
        for (let i = 0; i < uniformCount; i++) {
          let uniformInfo = gl.getActiveUniform(this.program, i);
          uniformName = uniformInfo.name.replace('[0]', '');
          this.uniform[uniformName] = gl.getUniformLocation(this.program, uniformName);
        }
      }
      gl.deleteShader(this._vertShader);
      gl.deleteShader(this._fragShader);
    }

    gl.useProgram(this.program);

    if (this._nextUseCallbacks.length) {
      for (let callback of this._nextUseCallbacks) {
        callback(this);
      }
      this._nextUseCallbacks = [];
    }
  }
}
