import { patch } from './patchlib.mjs';
const file = 'apps/web/src/ui/components.tsx';

const old = `export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (next: T) => void; ariaLabel: string;
}) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}`;

const neu = `/**
 * A segmented control whose selection travels.
 *
 * The white pill used to be a background on whichever button was selected, so choosing a different
 * filter made it vanish from one place and appear in another. Two things are lost by that. The
 * obvious one is smoothness. The one that matters is direction: a pill that slides left tells the
 * reader they have gone back along a scale — ทั้งหมด, กำลังดำเนินการ, ฉบับร่าง, ปิดแล้ว is a
 * sequence, and a control that only ever blinks makes it a set of unrelated buttons.
 *
 * One pill is drawn behind the row and moved to the selected button's box. It is measured rather
 * than calculated, because the buttons are text-sized and wrap: the second row of a wrapped control
 * is somewhere no arithmetic over indices would have put it.
 */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (next: T) => void; ariaLabel: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      const selected = element.querySelector<HTMLElement>('button[aria-selected="true"]');
      if (!selected) { setPill(null); return; }
      // Two rectangles rather than offsetLeft: the control wraps, and a wrapped button's offset
      // parent is not the thing anybody would guess from its index.
      const bounds = element.getBoundingClientRect();
      const box = selected.getBoundingClientRect();
      setPill({
        left: box.left - bounds.left, top: box.top - bounds.top,
        width: box.width, height: box.height
      });
    };
    measure();
    // The button keeps moving after the render that selected it — a font arriving, the toolbar
    // reflowing, the control wrapping onto a second line — so it is watched rather than read once.
    const frame = requestAnimationFrame(measure);
    let stopObserving = () => {};
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      for (const button of element.querySelectorAll('button')) observer.observe(button);
      stopObserving = () => observer.disconnect();
    }
    return () => { cancelAnimationFrame(frame); stopObserving(); };
  }, [options, value]);

  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel} ref={row}>
      {pill && (
        <span
          className="ui-segmented-pill"
          aria-hidden="true"
          style={{ transform: \`translate(\${pill.left}px, \${pill.top}px)\`, width: pill.width, height: pill.height }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}`;

patch(file, [[old, neu]]);
console.log('segmented selection travels');
