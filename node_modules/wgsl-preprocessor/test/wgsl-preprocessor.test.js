import { expect } from 'chai';
import { wgsl } from "../wgsl-preprocessor.js"

describe('wgsl tag', () => {
  it('should return strings without preprocessor symbols unchanged', () => {
    expect(wgsl`test`).to.equal(`test`);
    expect(wgsl`${1}`).to.equal(`1`);
  });

  it('should return unknown preprocessor symbols unchanged', () => {
    expect(wgsl`#foo`).to.equal(`#foo`);
    expect(wgsl`#☠️`).to.equal(`#☠️`);
  });

  describe('#if', () => {

    it('should include the contents of an #if block if the expression is truthy', () => {
      const x = 3;
      const f = () => 3;
      expect(wgsl`#if ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${12} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${'string'} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${new Float32Array(1)} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x > 1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x == 3} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f()} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() > 1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() == 3} Yes #endif`).to.equal(` Yes `);
    });

    it('should omit the contents of an #if block if the expression is not truthy', () => {
      const x = 0;
      const f = () => 0;
      expect(wgsl`#if ${false} No #endif`).to.equal(``);
      expect(wgsl`#if ${0} No #endif`).to.equal(``);
      expect(wgsl`#if ${null} No #endif`).to.equal(``);
      expect(wgsl`#if ${undefined} No #endif`).to.equal(``);
      expect(wgsl`#if ${''} No #endif`).to.equal(``);
      expect(wgsl`#if ${x} No #endif`).to.equal(``);
      expect(wgsl`#if ${x > 1} No #endif`).to.equal(``);
      expect(wgsl`#if ${x != 0} No #endif`).to.equal(``);
      expect(wgsl`#if ${f()} No #endif`).to.equal(``);
      expect(wgsl`#if ${f() > 1} No #endif`).to.equal(``);
      expect(wgsl`#if ${f() != 0} No #endif`).to.equal(``);
    });

    it('should include content before and after the #if block', () => {
      expect(wgsl`Yes #if ${true} Yes #endif Yes`).to.equal(`Yes  Yes  Yes`);
      expect(wgsl`Yes #if ${false} No #endif Yes`).to.equal(`Yes  Yes`);
    });

    it('should work across multiple lines', () => {
      expect(wgsl`#if ${true}
        Yes
      #endif`).to.equal(`
        Yes
      `);
    });

    it('should work with any amount of whitespace between the #if and the expression', () => {
      expect(wgsl`#if${true}Yes#endif`).to.equal(`Yes`);

      // Spaces
      expect(wgsl`#if  ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if   ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if    ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if     ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if      ${true} Yes #endif`).to.equal(` Yes `);

      // Tabs
      expect(wgsl`#if	${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if		${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if			${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if				${true} Yes #endif`).to.equal(` Yes `);
    });

    it('should work mid-line', () => {
      expect(wgsl`Test #if ${true} Yes #endif`).to.equal(`Test  Yes `);
      expect(wgsl`Test#if ${true} Yes #endif`).to.equal(`Test Yes `);
    });

    it('should nest', () => {
      expect(wgsl`
      #if ${true}
        #if ${true}
          Yes
        #endif
      #endif`.trim()).to.equal(`Yes`);

      expect(wgsl`
      #if ${false}
        #if ${true}
          Yes
        #endif
      #endif`.trim()).to.equal(``);

      expect(wgsl`
      #if ${true}
        #if ${true}
          #if ${false}
            No
            #if ${true}
              No
            #endif
          #endif
          #if ${true}
            Yes
            #if ${false}
              No
            #endif
          #endif
        #endif
        #if ${false}
          No
        #endif
      #endif`.trim()).to.equal(`Yes`);
    });

  });

  describe('#elif', () => {

    it('should include the contents of an #elif block if the expression is truthy', () => {
      const x = 3;
      const f = () => 3;
      expect(wgsl`#if ${false} No #elif ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${12} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${'string'} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${new Float32Array(1)} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${x} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${x > 1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${x == 3} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${f()} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${f() > 1} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${f() == 3} Yes #endif`).to.equal(` Yes `);
    });

    it('should omit the contents of an #elif block if the expression is not truthy', () => {
      const x = 0;
      const f = () => 0;
      expect(wgsl`#if ${false} No #elif ${false} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${0} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${null} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${undefined} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${''} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${x} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${x > 1} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${x != 0} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${f()} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${f() > 1} No #endif`).to.equal(``);
      expect(wgsl`#if ${false} No #elif ${f() != 0} No #endif`).to.equal(``);
    });

    it('should include the contents of the block if the expression is truthy the preceeding #if was not truthy', () => {
      expect(wgsl`#if ${false} No #elif ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${false} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${false} No #endif`).to.equal(``);
    });

    it('should allow for any number of chained #elif blocks', () => {
      expect(wgsl`#if ${false} No #elif ${false} No #elif ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #elif ${false} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${true} No #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${false} No #elif ${true} No #endif`).to.equal(` Yes `);

      expect(wgsl`#if ${false} No #elif ${false} No #elif ${false} No #elif ${true} Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #elif ${true} No #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #elif ${false} No #elif ${false} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${true} No #elif ${true} No #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${false} No #elif ${true} No #elif ${true} No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${false} No #elif ${false} No #elif ${false} No #endif`).to.equal(` Yes `);
    });

    it('should nest', () => {
      expect(wgsl`
      #if ${true}
        #if ${false}
          No
        #elif ${true}
          Yes
        #endif
      #endif`.trim()).to.equal(`Yes`);

      expect(wgsl`
      #if ${false}
        No
      #elif ${true}
        #if ${true}
          Yes
        #endif
      #endif`.trim()).to.equal(`Yes`);

      expect(wgsl`
      #if ${false}
        No
      #elif ${false}
        #if ${true}
          No
        #endif
      #endif`.trim()).to.equal(``);
    });

  });

  describe('#else', () => {

    it('should include the contents of an #else block if the #if expression is not truthy', () => {
      const x = 0;
      const f = () => 0;
      expect(wgsl`#if ${false} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${0} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${null} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${undefined} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${''} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x > 1} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x != 0} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f()} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() > 1} No #else Yes #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() != 0} No #else Yes #endif`).to.equal(` Yes `);
    });

    it('should omit the contents of an #else block if the #if expression is truthy', () => {
      const x = 3;
      const f = () => 3;
      expect(wgsl`#if ${true} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${1} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${12} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${'string'} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${new Float32Array(1)} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x > 1} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${x == 3} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f()} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() > 1} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${f() == 3} Yes #else No #endif`).to.equal(` Yes `);
    });

    it('should omit the contents of an #else block if any preceeding #elif expression is truthy', () => {
      expect(wgsl`#if ${true} Yes #elif ${false} No #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${true} Yes #elif ${true} No #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${false} No #else Yes #endif`).to.equal(` Yes `);

      expect(wgsl`#if ${true} Yes #elif ${false} No #elif ${false} No #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${true} Yes #elif ${false} No #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${false} No #elif ${true} Yes #else No #endif`).to.equal(` Yes `);
      expect(wgsl`#if ${false} No #elif ${false} No #elif ${false} No #else Yes #endif`).to.equal(` Yes `);
    });

  });

  describe('errors', () => {
    it('should not allow #if statments that are not immediately followed by an expression', () => {
      expect(() => wgsl`#if No #endif`).to.throw();
      expect(() => wgsl`#if 1 No #endif`).to.throw();
      expect(() => wgsl`#if true No #endif`).to.throw();
      expect(() => wgsl`#if true ${true} No #endif`).to.throw();
    });

    it('should not allow #elif without a preceeding #if', () => {
      expect(() => wgsl`#elif ${true} No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #endif #elif ${true} No #endif`).to.throw();
      expect(() => wgsl`#elif ${true} No #elif ${true} No #endif`).to.throw();
    });

    it('should not allow #elif statments that are not immediately followed by an expression', () => {
      expect(() => wgsl`#if ${true} No #elif No #endif`).to.throw();
      expect(() => wgsl`#if ${true} No #elif 1 No #endif`).to.throw();
      expect(() => wgsl`#if ${true} No #elif true No #endif`).to.throw();
      expect(() => wgsl`#if ${true} No #elif true ${true} No #endif`).to.throw();

      expect(() => wgsl`#if ${false} No #elif No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif 1 No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif true No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif true ${true} No #endif`).to.throw();

      expect(() => wgsl`#if ${false} No #elif ${false} No #elif No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif ${false} No #elif 1 No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif ${false} No #elif true No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #elif ${false} No #elif true ${true} No #endif`).to.throw();
    });

    it('should not allow #else without a preceeding #if', () => {
      expect(() => wgsl`#else ${true} No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #endif #else ${true} No #endif`).to.throw();
      expect(() => wgsl`#elif ${true} No #else No #endif`).to.throw();
    });

    it('should not allow #endif without a preceeding #if', () => {
      expect(() => wgsl`#endif No`).to.throw();
      expect(() => wgsl`#if ${false} No #endif #endif No`).to.throw();
      expect(() => wgsl`#if ${true} No #endif #endif No`).to.throw();
      expect(() => wgsl`#elif ${false} No #endif`).to.throw();
      expect(() => wgsl`#else No #endif`).to.throw();
    });

    it('should not allow #if without a matching #endif', () => {
      expect(() => wgsl`#if ${false} No`).to.throw();
      expect(() => wgsl`#if ${true} No`).to.throw();
      expect(() => wgsl`#if ${false} No #endif #if ${false} No`).to.throw();
      expect(() => wgsl`#if ${false} No #if ${false} No #endif`).to.throw();
      expect(() => wgsl`#if ${false} No #else No`).to.throw();
      expect(() => wgsl`#if ${false} No #elif ${true} No`).to.throw();
      expect(() => wgsl`#if ${false} No #elif ${true} No #else No`).to.throw();
    });
  });
});
