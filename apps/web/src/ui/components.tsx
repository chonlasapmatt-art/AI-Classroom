import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
// `useToast` and the tone type live in ./toastContext, which is what a screen imports to raise one.
import { ToastContext, type ToastTone } from './toastContext';
import { Icon } from './Icon';

/**
 * The shared building blocks every screen is made of.
 *
 * Pages compose these instead of styling themselves, which is what keeps spacing, radius, colour and
 * touch-target sizes identical across the app — including on a classroom board where every control
 * has to stay comfortably tappable.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`ui-button ui-button-${variant} ui-size-${size} ${className}`.trim()}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'secondary', size = 'md', children }: {
  to: string; variant?: ButtonVariant; size?: ControlSize; children: ReactNode;
}) {
  return <Link className={`ui-button ui-button-${variant} ui-size-${size}`} to={to}>{children}</Link>;
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...rest} aria-label={label} className="ui-icon-button">{children}</button>;
}

export function Card({ children, className = '', as: Element = 'section', padded = true }: {
  children: ReactNode; className?: string; as?: 'section' | 'article' | 'div'; padded?: boolean;
}) {
  return <Element className={`ui-card ${padded ? 'ui-card-padded' : ''} ${className}`.trim()}>{children}</Element>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="ui-card-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="ui-page-actions">{action}</div>}
    </header>
  );
}

export function Badge({ tone = 'neutral', children, subtle = true }: { tone?: Tone; children: ReactNode; subtle?: boolean }) {
  return <span className={`ui-badge ui-badge-${tone} ${subtle ? '' : 'ui-badge-solid'}`.trim()}>{children}</span>;
}

/**
 * `icon` and `status` are both optional and both do a job colour alone cannot.
 *
 * The tone already tints the tile, and a reader who cannot separate two hues gets nothing from that.
 * The icon gives the number a shape, and `status` puts the judgement in words — "ต้องจัดการ" beside
 * a red 4 is a different message from a red 4 on its own.
 */
export function Stat({ label, value, hint, tone = 'brand', icon, status }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; status?: ReactNode;
}) {
  return (
    <article className={`ui-stat ui-stat-${tone}`}>
      <span className="ui-stat-top">
        <span className="ui-stat-label">{label}</span>
        {icon && <span className="ui-stat-icon" aria-hidden="true">{icon}</span>}
      </span>
      <strong className="ui-stat-value">{value}</strong>
      {status && <span className="ui-stat-status">{status}</span>}
      {hint && <span className="ui-stat-hint">{hint}</span>}
    </article>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon" aria-hidden="true">{icon ?? <Icon name="star" size={28} />}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ui-empty ui-empty-error" role="alert">
      <span className="ui-empty-icon" aria-hidden="true"><Icon name="warning" size={28} /></span>
      <h3>ไม่สามารถโหลดข้อมูลได้</h3>
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>ลองใหม่</Button>}
    </div>
  );
}

/**
 * The refusal that is about authority rather than about failure.
 *
 * A page that shows "โหลดข้อมูลไม่สำเร็จ" when the real answer is "this is not yours to see" sends
 * somebody to support with a bug report about a permission working correctly. The database decides;
 * this only says so in words a person can act on.
 */
export function ForbiddenState({ message = 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้', hint }: {
  message?: string; hint?: ReactNode;
}) {
  return (
    <div className="ui-empty ui-empty-forbidden" role="status">
      <span className="ui-empty-icon" aria-hidden="true"><Icon name="eye" size={28} /></span>
      <h3>{message}</h3>
      <p>{hint ?? 'บัญชีของคุณเห็นได้เฉพาะข้อมูลตามบทบาทที่โรงเรียนกำหนดไว้'}</p>
    </div>
  );
}

/**
 * Where a change currently is, between this device and the server.
 *
 * These are not degrees of failure. This product is local-first: a mark written on a bus is saved,
 * correctly and completely, and will reach the server later. Painting that state in the same red as
 * a real error taught people that the normal case is a problem — so `offline` and `queued` are calm
 * and only `conflict`, which genuinely needs a person to choose, raises its voice.
 *
 * Each state carries a word as well as a colour, because a colour alone is not a status for a reader
 * who cannot separate two hues.
 */
export type ConnectionState = 'offline' | 'queued' | 'syncing' | 'synced' | 'conflict';

const connectionCopy: Record<ConnectionState, { icon: 'sync' | 'check' | 'warning' | 'refresh'; label: string; detail: string }> = {
  offline: { icon: 'sync', label: 'ออฟไลน์อยู่', detail: 'ยังทำงานต่อได้ตามปกติ ระบบจะซิงก์ให้เองเมื่อกลับมาออนไลน์' },
  queued: { icon: 'sync', label: 'บันทึกไว้ในเครื่องแล้ว', detail: 'รอซิงก์เมื่อออนไลน์ · ข้อมูลไม่หายแม้ปิดแอป' },
  syncing: { icon: 'refresh', label: 'กำลังซิงก์ข้อมูล', detail: 'กำลังส่งการเปลี่ยนแปลงขึ้นเซิร์ฟเวอร์' },
  synced: { icon: 'check', label: 'ซิงก์สำเร็จ', detail: 'ข้อมูลบนเครื่องนี้ตรงกับเซิร์ฟเวอร์แล้ว' },
  conflict: { icon: 'warning', label: 'ข้อมูลนี้มีการแก้ไขจากอีกเครื่อง', detail: 'กรุณาตรวจสอบและเลือกว่าจะเก็บฉบับใด' }
};

export function ConnectionBanner({ state, action }: { state: ConnectionState; action?: ReactNode }) {
  const copy = connectionCopy[state];
  return (
    <div
      className={`ui-connection ui-connection-${state}`}
      // Announced politely: a teacher mid-sentence in a text field should learn that the queue
      // drained without being interrupted to hear it.
      role="status" aria-live="polite"
    >
      <span className="ui-connection-icon" aria-hidden="true"><Icon name={copy.icon} size={16} /></span>
      <span className="ui-connection-copy">
        <strong>{copy.label}</strong>
        <span>{copy.detail}</span>
      </span>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`ui-skeleton ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${100 - index * 12}%` }} />)}
    </div>
  );
}

/**
 * `status` is the state of the WRITE, not of the field.
 *
 * "saving" while the request is in flight, "saved" only once the server has answered — never on
 * optimistic hope. A field that says บันทึกแล้ว before the transaction committed teaches people to
 * trust a message that is sometimes a lie, and they stop reading it at exactly the moment it
 * matters. The mapping to the toast rule elsewhere in the product is deliberate: the same claim is
 * made in the same place, once, and only when it is true.
 */
export type FieldStatus = 'idle' | 'saving' | 'saved';

export function Field({ label, hint, error, status = 'idle', children }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; status?: FieldStatus; children: ReactNode;
}) {
  return (
    <label className={`ui-field ${error ? 'ui-field-error' : ''} ${status === 'saved' ? 'ui-field-saved' : ''}`.trim()}>
      <span className="ui-field-label">
        {label}
        {status === 'saving' && <span className="ui-field-status" role="status">กำลังบันทึก…</span>}
        {status === 'saved' && (
          <span className="ui-field-status ui-field-status-saved" role="status">
            <Icon name="check" size={12} />บันทึกแล้ว
          </span>
        )}
      </span>
      {children}
      {/*
        The hint and the message share one line that is always present, so a validation error
        appearing does not push everything below it down the page. Layout that jumps under a reader
        is how somebody clicks the row beneath the one they aimed at.
      */}
      <span className="ui-field-foot">
        {error
          ? <span className="ui-field-message" role="alert">{error}</span>
          : hint && <span className="ui-field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function FieldGroup({ title, children, columns = 2 }: { title?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <fieldset className="ui-fieldset">
      {title && <legend>{title}</legend>}
      <div className={`ui-field-grid ui-columns-${columns}`}>{children}</div>
    </fieldset>
  );
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
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
}

/**
 * A dialog that actually behaves like one.
 *
 * Escape used to be handled by `onKeyDown` on the backdrop, which only fires when something inside
 * already has focus — so a dialog opened by a click, with focus still on the button behind it,
 * ignored the key. It is a window listener now.
 *
 * Focus is moved in on open and returned to whatever opened it on close, and Tab is wrapped so it
 * cannot walk out into the page underneath. Without the wrap a keyboard user tabs off the last
 * button straight into a form they cannot see, on top of which the backdrop is still catching every
 * click — which reads as the application having frozen.
 */
export function Modal({ title, description, onClose, children, actions, wide }: {
  title: ReactNode; description?: ReactNode; onClose(): void; children?: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? [])].filter((node) => node.offsetParent !== null || node === document.activeElement);

    // The panel itself takes focus when it holds nothing focusable, so a screen reader lands on the
    // dialog rather than staying on the page behind it.
    (focusable()[0] ?? panel.current)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (nodes.length === 0) { event.preventDefault(); return; }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      // Returning focus is what lets somebody who opened a dialog by keyboard carry on from where
      // they were instead of at the top of the document.
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="ui-modal-backdrop"
      // Only a click that both started and ended on the backdrop closes it: a drag that begins on
      // text inside the panel and releases outside is a selection, not a dismissal.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className={`ui-modal ${wide ? 'ui-modal-wide' : ''}`.trim()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        ref={panel} tabIndex={-1}
      >
        <header className="ui-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose}><Icon name="close" size={16} /></IconButton>
        </header>
        {children && <div className="ui-modal-body">{children}</div>}
        {actions && <footer className="ui-modal-actions">{actions}</footer>}
      </section>
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'brand', label }: { value: number; max: number; tone?: Tone; label?: ReactNode }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="ui-progress">
      <div
        className={`ui-progress-track ui-progress-${tone}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {label && <span className="ui-progress-label">{label}</span>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

export function DataTable({ head, children, caption }: { head: ReactNode; children: ReactNode; caption?: string }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table">
        {caption && <caption className="ui-visually-hidden">{caption}</caption>}
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Confirmation dialog for destructive or important actions. */
export function ConfirmDialog({ title, description, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', tone = 'danger', onConfirm, onCancel }: {
  title: ReactNode; description?: ReactNode; confirmLabel?: string; cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'brand'; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      description={description}
      onClose={onCancel}
      actions={<>        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>}
    />
  );
}

/** Tooltip wrapper that shows hint text on hover or focus. */
export function Tooltip({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <span className="ui-tooltip-wrap" title={typeof tip === 'string' ? tip : undefined}>
      {children}
      {typeof tip !== 'string' && <span className="ui-tooltip-bubble" role="tooltip">{tip}</span>}
    </span>
  );
}

/* ---------- Toast / Snackbar ---------- */

interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  duration: number;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  /*
   * Dismissing and removing are two steps, and both have to exist.
   *
   * `dismiss` starts the exit by zeroing the duration; `remove` is what actually takes the node out
   * once that animation has run. With only the first, every message a session ever raised stayed in
   * the document — invisible, but still a `role="status"` node in the live region, and a container
   * that grew for as long as the tab was open. Nothing caught it because the provider was never
   * mounted anywhere until now.
   */
  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, duration: 0 } : t)));
  }, []);

  const toast = useCallback(
    (title: string, opts?: { message?: string; tone?: ToastTone; duration?: number }) => {
      const id = ++toastId;
      setItems((prev) => [...prev, { id, title, ...(opts?.message != null ? { message: opts.message } : {}), tone: opts?.tone ?? 'info', duration: opts?.duration ?? 4000 }]);
    },
    [],
  );

  const ctx = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="ui-toast-container" aria-live="polite" aria-relevant="additions removals">
        {items.map((item) => (
          <ToastItemView key={item.id} item={item} onDismiss={dismiss} onRemoved={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItemView({ item, onDismiss, onRemoved }: {
  item: ToastItem; onDismiss: (id: number) => void; onRemoved: (id: number) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const ref = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // A duration of zero means the exit has been asked for — by the close button, or by the timer
    // below having run out. Both funnel through the same path so a message leaves the same way
    // whether a person dismissed it or it expired.
    if (item.duration <= 0) {
      setExiting(true);
      const t = setTimeout(() => onRemoved(item.id), 200);
      return () => clearTimeout(t);
    }
    ref.current = setTimeout(() => onDismiss(item.id), item.duration);
    return () => { if (ref.current) clearTimeout(ref.current); };
  }, [item.duration, item.id, onDismiss, onRemoved]);

  const toastIcons: Record<ToastTone, 'info' | 'success' | 'warning' | 'error'> = { info: 'info', success: 'success', warning: 'warning', error: 'error' };

  return (
    <div className={`ui-toast ui-toast-${item.tone} ${exiting ? 'ui-toast-exiting' : ''}`} role="status">
      <span className="ui-toast-icon" aria-hidden="true"><Icon name={toastIcons[item.tone]} size={16} /></span>
      <div className="ui-toast-content">
        <div className="ui-toast-title">{item.title}</div>
        {item.message && <div className="ui-toast-message">{item.message}</div>}
      </div>
      <button className="ui-toast-close" aria-label="ปิด" onClick={() => onDismiss(item.id)}>×</button>
    </div>
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (next: T) => void; ariaLabel: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Drawer / Slide-over ---------- */

export function Drawer({ title, onClose, children, footer }: {
  title: ReactNode; onClose(): void; children?: ReactNode; footer?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

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
        </header>
        {children && <div className="ui-drawer-body">{children}</div>}
        {footer && <footer className="ui-drawer-footer">{footer}</footer>}
      </aside>
    </>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return (
    <nav className="ui-pagination" aria-label="หน้า">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="ก่อนหน้า">‹</button>
      {pages.map((p, idx) =>
        p === '...' ? (
          <span key={`e${idx}`} className="ui-pagination-info">…</span>
        ) : (
          <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</button>
        )
      )}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="ถัดไป">›</button>
    </nav>
  );
}

/* ---------- Search input ---------- */

export function SearchInput({ value, onChange, placeholder = 'ค้นหา...', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`ui-search ${className}`.trim()}>
      <span className="ui-search-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
      <input
        type="search" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // Escape clears, which is what people already press; the browser's own clear on a
        // `type="search"` input is Chrome-only and invisible on a touch screen.
        onKeyDown={(event) => { if (event.key === 'Escape' && value !== '') { event.preventDefault(); onChange(''); } }}
      />
      {value !== '' && (
        <button type="button" className="ui-search-clear" onClick={() => onChange('')} aria-label="ล้างคำค้น">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------- Auto-sizing textarea ---------- */

/**
 * A textarea that grows to fit what has been typed, up to a ceiling.
 *
 * A fixed three-row box for a reason field, an announcement or a comment means the writer is
 * composing through a letterbox — they cannot see the sentence they wrote two lines ago while
 * writing the next one. Growing removes the scrollbar for the ordinary case and keeps it for the
 * essay, which is the only case that needed one.
 *
 * The height is recomputed from `value`, not from keystrokes, so a programmatic change (a draft
 * restored, a field cleared on submit) resizes too.
 */
export function AutoTextarea({ value, onChange, minRows = 3, maxRows = 12, ...rest }: {
  value: string; onChange: (next: string) => void; minRows?: number; maxRows?: number;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Collapse first: without this the box can only ever grow, because scrollHeight of an already
    // tall element reports the height it currently has rather than the height it needs.
    node.style.height = 'auto';
    const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
    const padding = node.offsetHeight - node.clientHeight;
    node.style.height = `${Math.min(node.scrollHeight, line * maxRows + padding)}px`;
  }, [value, maxRows]);

  return (
    <textarea
      {...rest}
      ref={ref} rows={minRows} value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`ui-autotextarea ${rest.className ?? ''}`.trim()}
    />
  );
}

/* ---------- Password input ---------- */

/**
 * A password field that can be read back.
 *
 * Every entrance in this product is a name and a password typed on a phone or a classroom board,
 * where a mistyped character is invisible and the only feedback is a refusal. Being able to look at
 * what was typed turns "รหัสผ่านไม่ถูกต้อง" from a dead end into a typo somebody can see.
 *
 * Revealing is per-field and resets on unmount: nothing is remembered, and the value never leaves
 * the input it was typed into.
 */
export function PasswordInput({ value, onChange, placeholder, autoComplete = 'current-password', required, disabled, id, name }: {
  value: string; onChange: (next: string) => void; placeholder?: string;
  autoComplete?: string; required?: boolean; disabled?: boolean; id?: string; name?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="ui-password">
      <input
        type={revealed ? 'text' : 'password'}
        value={value} onChange={(event) => onChange(event.target.value)}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(id === undefined ? {} : { id })}
        {...(name === undefined ? {} : { name })}
        autoComplete={autoComplete} required={required} disabled={disabled}
      />
      <button
        type="button" className="ui-password-toggle"
        onClick={() => setRevealed((current) => !current)}
        // The control announces what it will DO, not what it currently is: a reader hearing
        // "hide password" on a masked field has been told the opposite of the truth.
        aria-label={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        aria-pressed={revealed}
        disabled={disabled}
      >
        <Icon name="eye" size={16} />
      </button>
    </div>
  );
}
