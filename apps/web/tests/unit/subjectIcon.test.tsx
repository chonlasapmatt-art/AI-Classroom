import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectIcon } from '../../src/features/subjects/SubjectIcon';
import { standardSubjects, subjectIconKeys, subjectIconLabels } from '../../src/data/subjectCatalog';

describe('subject icons', () => {
  it('draws every icon on the same 24x24 grid so it fits any frame', () => {
    for (const key of subjectIconKeys) {
      const { container, unmount } = render(<SubjectIcon iconKey={key} size={20} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('width')).toBe('20');
      expect(svg.getAttribute('height')).toBe('20');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('gives every standard subject a real icon instead of the fallback', () => {
    for (const seed of standardSubjects) {
      expect(subjectIconKeys).toContain(seed.iconKey);
    }
  });

  it('falls back safely for an unknown key and labels every option', () => {
    const { container } = render(<SubjectIcon iconKey="not-a-real-icon" />);
    expect(container.querySelector('svg')).not.toBeNull();
    for (const key of subjectIconKeys) expect(subjectIconLabels[key].length).toBeGreaterThan(0);
  });

  it('is hidden from screen readers unless it carries a title', () => {
    const plain = render(<SubjectIcon iconKey="math" />);
    expect(plain.container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    plain.unmount();
    const titled = render(<SubjectIcon iconKey="math" title="คณิตศาสตร์" />);
    expect(titled.container.querySelector('svg')!.getAttribute('role')).toBe('img');
  });
});
