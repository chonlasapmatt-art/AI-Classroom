import { patch } from './patchlib.mjs';
const file = 'apps/web/src/ui/components.tsx';

const old = `  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="ui-drawer-backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} />
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="ui-drawer-header">
          <h2>{title}</h2>
          <IconButton label="ปิด" onClick={onClose}>×</IconButton>
        </header>`;

const neu = `  const backdropRef = useRef<HTMLDivElement>(null);
  // A drawer that slides in from the edge and then blinks out is the asymmetry people read as
  // abrupt. It leaves along the same edge it came from, over a slightly shorter time.
  const { closing, dismiss, onAnimationEnd } = useDismissAnimation(onClose, 190);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dismiss]);

  return (
    <>
      <div
        className={\`ui-drawer-backdrop \${closing ? 'is-closing' : ''}\`.trim()}
        ref={backdropRef}
        onClick={(e) => { if (e.target === backdropRef.current) dismiss(); }}
      />
      <aside
        className={\`ui-drawer \${closing ? 'is-closing' : ''}\`.trim()}
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        onAnimationEnd={onAnimationEnd}
      >
        <header className="ui-drawer-header">
          <h2>{title}</h2>
          <IconButton label="ปิด" onClick={dismiss}>×</IconButton>
        </header>`;

patch(file, [[old, neu]]);
console.log('drawer dismisses through its exit');
