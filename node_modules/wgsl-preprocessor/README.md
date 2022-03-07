# WGSL Preprocessor

This library provides a dirt-simple way of adding simple preprocessor macros to
your WGSL shaders via [tagged templates](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates). It supports:

 - `#if`
 - `#elif`
 - `#else`
 - `#endif`

Most other typical preprocessor functionality can be supported via JavaScript's
[template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals).

## Usage

Import the `wgsl` symbol from `wgsl-preprocessor.js` and use it as a tag for a
template literal string:

```js
import { wgsl } from './wgsl-preprocessor.js';

function getDebugShader(sRGB = false) {
  return wgsl`
  @stage(fragment)
  fn main() -> @location(0) vec4<f32> {
    let color = vec4(1.0, 0.0, 0.0, 1.0);
  #if ${sRGB}
    let rgb = pow(color.rgb, vec3(1.0 / 2.2));
    return vec4(rgb, color.a);
  #else
    return color;
  #endif
  }`;
}
`
```

When using `#if` or `#elif` the preprocessor symbol _must_ be followed by a
substitution expression that will be evaluated as a boolean.

```js
wgsl`
  #if ${someVar}         // Valid
  #endif

  #if ${x > 5}           // Valid
  #endif

  #if ${someFunction()}  // Valid
  #endif

  #if true               // Invalid
  #endif

  #if 1                  // Invalid
  #endif
`;
```

If the result of the expression is [truthy](https://developer.mozilla.org/en-US/docs/Glossary/Truthy)
then the string contents between the opening and closing tags will be returned
as part of the string, otherwise it will be omitted.

```js
const x = 1;
const source = wgsl`
#if ${x < 3}
  let a = 1;
#endif

#if ${x > 3}
  let b = 2;
#endif

#if ${x == 3}
  let c = 3;
#else
  let c = 0;
#endif

#if ${x == 4}
  let d = 4;
#elif ${x == 1}
  let d = 1;
#else
  let d = 0;
#endif
`;

// source will be:
// let a = 1
//
//
// let c = 0;
//
// let d = 1;
```

`#if`/`#elif` statements may be nested any number of levels deep:

```js
wgsl`
#if ${shadowsEnabled}
  #if ${lightType == 'point'}
    let shadowAmount = computePointLightShadow();
  #elif ${lightType == 'spot'}
    let shadowAmount = computeSpotLightShadow();
  #else
    let shadowAmount = computeDirectionalShadow();
  #endif
  lightFactor = lightFactor - shadowAmount;
#endif
`;
```

And any number of `#elif`s may be chained:

```js
wgsl`
#if ${sampleCount == 1}
  var sampleOffsets : array<vec2<f32>, 1> = array<vec2<f32>, 1>(
    vec2(0.0, 0.0)
  );
#elif ${sampleCount == 2}
  var sampleOffsets : array<vec2<f32>, 2> = array<vec2<f32>, 2>(
    vec2(-0.5, -0.5), vec2(0.5, 0.5)
  );
#elif ${sampleCount == 4}
  var sampleOffsets : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
    vec2(-0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, -0.5), vec2(0.5, 0.5),
  );
#elif ${sampleCount == 8}
  // Etc...
#endif
`;
```

## Why no `#define`?

If you need something to approximate a `#define` statement from other
preprocessors, simply use JavaScript's built-in substitution expressions! You
don't even need the `wgsl` tag!

```js
const ambientFactor = 1.0;
const sampleCount = 2;

const source = `
  let ambientFactor = f32(${ambientFactor});

  for (var i = 0u; i < ${sampleCount}u; i = i + 1u) {
    // Etc...
  }
`;
```
