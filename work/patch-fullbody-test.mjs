import { patch } from './patchlib.mjs';
const file = 'apps/web/tests/unit/avatarFullBody.test.tsx';

/* A keyframes block has nested braces, so [^}]* stops at the first inner rule. */
const helperAnchor = `describe('the poses', () => {`;
const helper = `/** One @keyframes block, braces and all. A [^}]* match stops at the first frame's closing brace. */
function keyframes(name: string): string {
  const start = poseStyles.indexOf(\`@keyframes \${name} {\`);
  if (start < 0) throw new Error(\`no @keyframes \${name}\`);
  let depth = 0;
  for (let index = poseStyles.indexOf('{', start); index < poseStyles.length; index += 1) {
    if (poseStyles[index] === '{') depth += 1;
    if (poseStyles[index] === '}') {
      depth -= 1;
      if (depth === 0) return poseStyles.slice(start, index + 1);
    }
  }
  throw new Error(\`unterminated @keyframes \${name}\`);
}

describe('the poses', () => {`;

const steppedOld = `  it('steps every single animation, without exception', () => {
    const animations = poseStyles.match(/animation: [^;]+;/g) ?? [];
    expect(animations.length).toBeGreaterThan(20);
    for (const declaration of animations) {
      expect(declaration, \`not stepped: \${declaration}\`).toContain('steps(');
    }
  });`;

const steppedNew = `  it('steps every single animation, without exception', () => {
    const animations = (poseStyles.match(/animation: [^;]+;/g) ?? [])
      // The reduced-motion block turns animation off rather than running one, which is the point.
      .filter((declaration) => !declaration.includes('none'));
    expect(animations.length).toBeGreaterThan(20);
    for (const declaration of animations) {
      expect(declaration, \`not stepped: \${declaration}\`).toContain('steps(');
    }
  });`;

const leanOld = `    const lean = /@keyframes runLean \{[^}]*\}/s.exec(poseStyles)?.[0] ?? '';
    const degrees = [...lean.matchAll(/rotate\((\d+)deg\)/g)].map((match) => Number(match[1]));`;
const leanNew = `    const degrees = [...keyframes('runLean').matchAll(/rotate\((\d+)deg\)/g)].map((match) => Number(match[1]));`;

const levitateOld = `    expect(poseStyles).toContain('@keyframes levitate');
    expect(poseStyles).toMatch(/@keyframes levitate \{[^}]*translateY\(-2px\)/s);`;
const levitateNew = `    expect(keyframes('levitate')).toContain('translateY(-2px)');`;

const leapOld = `    const leap = /@keyframes leap \{[^}]*\}/s.exec(poseStyles)?.[0] ?? '';
    expect(leap).toContain('scaleY(0.88)');`;
const leapNew = `    const leap = keyframes('leap');
    expect(leap).toContain('scaleY(0.88)');`;

patch(file, [
  [helperAnchor, helper], [steppedOld, steppedNew],
  [leanOld, leanNew], [levitateOld, levitateNew], [leapOld, leapNew]
]);
console.log('keyframes read as whole blocks');
