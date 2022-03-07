/** WGSL Preprocessor v1.0.0 **/
const preprocessorSymbols = /#([^\s]*)(\s*)/gm

// Template literal tag that handles simple preprocessor symbols for WGSL
// shaders. Supports #if/elif/else/endif statements.
export function wgsl(strings, ...values) {
  const stateStack = [];
  let state = { string: '', elseIsValid: false, expression: true };
  let depth = 1;

  for (let i = 0; i < strings.length; ++i) {
    const string = strings[i];
    const matchedSymbols = string.matchAll(preprocessorSymbols);

    let lastIndex = 0;
    let valueConsumed = false;

    for (const match of matchedSymbols) {
      state.string += string.substring(lastIndex, match.index);

      switch (match[1]) {
        case 'if':
          if (match.index + match[0].length != string.length) {
            throw new Error('#if must be immediately followed by a template expression (ie: ${value})');
          }
          valueConsumed = true;
          stateStack.push(state);
          depth++;
          state = { string: '', elseIsValid: true, expression: !!values[i] };
          break;
        case 'elif':
          if (match.index + match[0].length != string.length) {
            throw new Error('#elif must be immediately followed by a template expression (ie: ${value})');
            break;
          } else if (!state.elseIsValid) {
            throw new Error('#elif not preceeded by an #if or #elif');
            break;
          }
          valueConsumed = true;
          if (state.expression && stateStack.length != depth) {
            stateStack.push(state);
          }
          state = { string: '', elseIsValid: true, expression: !!values[i] };
          break;
        case 'else':
          if (!state.elseIsValid) {
            throw new Error('#else not preceeded by an #if or #elif');
            break;
          }
          if (state.expression && stateStack.length != depth) {
            stateStack.push(state);
          }
          state = { string: match[2], elseIsValid: false, expression: true };
          break;
        case 'endif':
          if (!stateStack.length) {
            throw new Error('#endif not preceeded by an #if');
            break;
          }
          const branchState = stateStack.length == depth ? stateStack.pop() : state;
          state = stateStack.pop();
          depth--;
          if (branchState.expression) {
            state.string += branchState.string;
          }
          state.string += match[2];
          break;
        default:
          // Unknown preprocessor symbol. Emit it back into the output string unchanged.
          state.string += match[0];
          break;
      }

      lastIndex = match.index + match[0].length;
    }

    // If the string didn't end on one of the preprocessor symbols append the rest of it here.
    if (lastIndex != string.length) {
      state.string += string.substring(lastIndex, string.length);
    }

    // If the next value wasn't consumed by the preprocessor symbol, append it here.
    if (!valueConsumed && values.length > i) {
      state.string += values[i];
    }
  }

  if (stateStack.length) {
    throw new Error('Mismatched #if/#endif count');
  }

  return state.string;
}