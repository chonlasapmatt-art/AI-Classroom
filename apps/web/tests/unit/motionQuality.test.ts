import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * How the interface is allowed to move.
 *
 * The rules here are about one thing: an animation either carries information or it is in the way.
 * They are checked against the stylesheets rather than against a screenshot because that is where
 * the decisions live, and because the failure they catch — a transition on a layout property, added
 * in good faith, three screens away from the one being worked on — is invisible in every other kind
 * of test and arrives as a school tablet stuttering.
 */

function sheet(name: string): string {
  const path = [`apps/web/src/design-system/${name}`, `src/design-system/${name}`]
    .map((candidate) => resolve(candidate))
    .find((candidate) => existsSync(candidate));
  expect(path, name).toBeTruthy();
  return readFileSync(path!, 'utf8');
}

const sheets = ['tokens.css', 'global.css', 'components.css', 'screens.css']
  .map((name) => ({ name, body: sheet(name) }));

interface Rule { file: string; selector: string; body: string }

/**
 * Every rule that animates something, with the selector it applies to.
 *
 * Read as rules rather than as declarations so an exemption can be about *what* is moving. "Three
 * hundred milliseconds is too slow" is true of a hover and false of a page introducing itself, and
 * only the selector knows which one a declaration belongs to.
 */
const rules: Rule[] = sheets.flatMap(({ name, body }) => {
  const found: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const selector = match[1]!.trim().split('\n').pop()!.trim();
    const declarations = match[2]!;
    if (declarations.includes('transition:')) found.push({ file: name, selector, body: declarations });
  }
  return found;
});

/*
 * The four rules allowed to animate a layout property, and why each one is.
 *
 * Two of them are a single absolutely-positioned indicator travelling between targets of different
 * sizes: scaling one instead would stretch its corner radius into an ellipse on the way, which is a
 * worse artefact than the one being avoided, and neither has a sibling to push around. One is the
 * menu collapsing, where the layout genuinely changes and the page is supposed to reflow. The last
 * is a textarea growing with what is typed into it, which *is* the feature.
 */
const layoutExemptions = ['.ui-segmented-pill', '.sidebar-marker', '.app-frame', '.ui-autotextarea'];

describe('how the interface moves', () => {
  it('animates what the compositor can animate, and nothing that forces a layout', () => {
    const banned = /\b(width|height|top|left|right|bottom|margin|padding|inline-size|block-size)\b/;
    const offenders = rules
      .filter((rule) => !layoutExemptions.some((allowed) => rule.selector.includes(allowed)))
      .filter((rule) => {
        const declaration = /transition:[^;]+/.exec(rule.body)?.[0] ?? '';
        return banned.test(declaration.replace(/var\([^)]*\)/g, ''));
      })
      .map((rule) => `${rule.file}: ${rule.selector}`);
    expect(offenders, `layout properties being animated:\n${offenders.join('\n')}`).toHaveLength(0);
  });

  it('keeps interface feedback under half a second', () => {
    /*
     * Over 300 ms reads as sluggish and over 500 ms reads as broken. The exception is the entrance
     * on the public pages: that is an arrival rather than a response — it plays once, before
     * anybody has asked the product for anything — and it is the one place a long curve is the
     * point rather than a cost.
     */
    const slow = rules
      .filter((rule) => !rule.selector.includes('welcome'))
      .flatMap((rule) => {
        const declaration = /transition:[^;]+/.exec(rule.body)?.[0] ?? '';
        return (declaration.match(/(\d{3,4})ms/g) ?? [])
          .filter((value) => Number.parseInt(value, 10) > 500)
          .map((value) => `${rule.file}: ${rule.selector} (${value})`);
      });
    expect(slow, `slower than half a second:\n${slow.join('\n')}`).toHaveLength(0);
  });

  it('fills every bar by scaling it rather than by resizing it', () => {
    // A bar that fills by width relays out the page on every frame; the same bar scaled costs one
    // composited layer. Five of them across the product, and they all do it the same way.
    const bars = ['.ui-progress-track span', '.avatar-widget-bar > span', '.platform-progress-track span', '.boot-progress-fill'];
    for (const bar of bars) {
      const rule = rules.find((entry) => entry.selector.includes(bar));
      expect(rule, `${bar} has no transition at all`).toBeTruthy();
      expect(rule!.body, bar).toContain('scaleX');
    }
  });

  it('lets somebody switch all of it off', () => {
    // Two switches, both honoured: the operating system's, and the app's own toggle. Neither is a
    // suggestion, so the rule is a blanket one rather than a list of animations to remember.
    const global = sheets.find((entry) => entry.name === 'global.css')!.body;
    expect(global).toContain('@media (prefers-reduced-motion:reduce)');
    expect(global).toContain(':root[data-motion="reduced"]');
    expect(global).toMatch(/::view-transition-group\(\*\)[^}]*animation: none/);
  });

  it('holds the shell still while the screen inside it changes', () => {
    /*
     * The menu and the bottom bar are the same objects before and after a navigation. Sliding them
     * out and back in says they were replaced, which is untrue, and is most of why moving between
     * screens used to feel like a reload.
     */
    const global = sheets.find((entry) => entry.name === 'global.css')!.body;
    expect(global).toContain('view-transition-name: app-sidebar');
    expect(global).toContain('view-transition-name: app-page');
    expect(global).toMatch(/::view-transition-group\(app-sidebar\)[\s\S]{0,120}animation: none/);
  });

  it('exits faster than it enters', () => {
    // A farewell nobody is waiting for should not delay the thing they are waiting for.
    const global = sheets.find((entry) => entry.name === 'global.css')!.body;
    const leaving = /::view-transition-old\(app-page\) \{ animation: screen-leave (\d+)ms/.exec(global);
    const arriving = /::view-transition-new\(app-page\) \{ animation: screen-arrive (\d+)ms/.exec(global);
    expect(leaving?.[1], 'the leaving screen has no timing').toBeTruthy();
    expect(Number(leaving![1])).toBeLessThan(Number(arriving![1]));
  });
});
