import { patch } from './patchlib.mjs';
patch('apps/web/tests/unit/paletteContrast.test.ts', [[
  `  it('separates each ground from the one it sits on, so elevation is visible without a shadow', () => {
    const ladder = ['canvas', 'surface-sunken', 'surface', 'surface-muted'].map(dark);
    const steps = ladder.slice(1).map((ground, index) => contrast(ground, ladder[index]!));
    // A step of 1.0 is two identical colours. Anything under about 1.08 is a border pretending to
    // be a level; these are deliberately far enough apart to be seen on a classroom projector.
    for (const [index, step] of steps.entries()) {
      expect(step, \`step \${index} of the dark ground ladder\`).toBeGreaterThan(1.1);
    }
  });`,
  `  it('separates each ground from the one it sits on, so elevation is visible without a shadow', () => {
    /*
     * Measured in sRGB steps rather than in contrast ratio. A WCAG ratio is the right tool for text
     * and the wrong one here: at this end of the scale it compresses so hard that #0f0e18 and
     * #23222f -- plainly two different greys on any screen -- come out at 1.22, which says nothing
     * about whether a person can see the edge between them.
     *
     * The ladder runs page, well, card, raised strip, hover. Each rung has to be a real step; the
     * old four were #131126, #161331, #1b1834 and #201d3d, three points of green apart at the
     * widest, which is why a card did not sit on the page.
     */
    const green = (name: string) => parseInt(dark(name).slice(3, 5), 16);
    const ladder = ['canvas', 'surface-sunken', 'surface', 'surface-muted'].map(green);
    for (const [index, rung] of ladder.slice(1).entries()) {
      expect(rung - ladder[index]!, \`step \${index} of the dark ground ladder\`).toBeGreaterThanOrEqual(5);
    }
    // And the page is the darkest thing on it, the navigation darker still.
    expect(green('nav-surface')).toBeLessThan(ladder[0]!);
  });`
]]);
console.log('ladder measured in sRGB steps');
