import { patch } from './patchlib.mjs';
const file = 'apps/web/src/ui/components.tsx';

/* ── Modal: close through the exit rather than by vanishing ── */
const modalOpen = `  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {`;
const modalOpenNew = `  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();
  /*
   * The dialog leaves the way it arrived.
   *
   * It used to open on a keyframe and then be removed from the tree, so it faded up over a fifth of
   * a second and disappeared between two frames. Every dismissal -- Escape, the close button, a
   * click on the scrim -- now runs the same exit, and \`onClose\` fires when that exit is over, so
   * the caller's state, the focus restoration and the scroll lock are unchanged and merely later.
   */
  const { closing, dismiss, onAnimationEnd } = useDismissAnimation(onClose, 160);

  useEffect(() => {`;

const escapeOld = `      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }`;
const escapeNew = `      if (event.key === 'Escape') { event.stopPropagation(); dismiss(); return; }`;

const effectDeps = `    };
  }, [onClose]);

  return (
    <div
      className="ui-modal-backdrop"
      // Only a click that both started and ended on the backdrop closes it: a drag that begins on
      // text inside the panel and releases outside is a selection, not a dismissal.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className={\`ui-modal \${wide ? 'ui-modal-wide' : ''}\`.trim()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        ref={panel} tabIndex={-1}
      >`;

const effectDepsNew = `    };
  }, [onClose, dismiss]);

  return (
    <div
      className={\`ui-modal-backdrop \${closing ? 'is-closing' : ''}\`.trim()}
      // Only a click that both started and ended on the backdrop closes it: a drag that begins on
      // text inside the panel and releases outside is a selection, not a dismissal.
      onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}
    >
      <section
        className={\`ui-modal \${wide ? 'ui-modal-wide' : ''} \${closing ? 'is-closing' : ''}\`.replace(/\s+/g, ' ').trim()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        ref={panel} tabIndex={-1}
        onAnimationEnd={onAnimationEnd}
      >`;

const closeButton = `          <IconButton label="ปิด" onClick={onClose}><Icon name="close" size={16} /></IconButton>`;
const closeButtonNew = `          <IconButton label="ปิด" onClick={dismiss}><Icon name="close" size={16} /></IconButton>`;

patch(file, [[modalOpen, modalOpenNew], [escapeOld, escapeNew], [effectDeps, effectDepsNew], [closeButton, closeButtonNew]]);
console.log('modal dismisses through its exit');
