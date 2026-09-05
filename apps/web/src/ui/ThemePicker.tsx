import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../app/ThemeContext';
import { themeModes, themePresets, type ThemeMode, type ThemePreset } from '../app/theme';
import { Icon } from './Icon';

/**
 * The one appearance control, used by every screen that has one.
 *
 * The public Home and the sign-in screen each grew their own copy of this panel, with their own
 * markup, their own stylesheet block and their own wording — "ปรับธีม" on one, "ปรับบรรยากาศ" on the
 * other, for a control that does exactly the same thing to the same four settings. Two copies of a
 * control are two chances to drift, and a person crossing from Home to sign-in should not have to
 * notice they have.
 *
 * It closes on Escape and on a click outside, which neither copy did: a panel that can only be shut
 * by finding its trigger again is a trap on a phone, where the trigger is often under the panel.
 */
export function ThemePicker({ className = '' }: { className?: string }) {
  const { mode, preset, motion, setMode, setPreset, setMotion } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className={`theme-picker ${open ? 'open' : ''} ${className}`.trim()} ref={root}>
      <button
        type="button"
        className="theme-picker-trigger"
        aria-expanded={open}
        aria-controls="theme-picker-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="settings" size={16} />
        <span>ปรับธีม</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </button>

      {open && (
        <div className="theme-picker-panel" id="theme-picker-panel">
          <div className="theme-picker-heading">
            <div>
              <strong>สไตล์ของคุณ</strong>
              <span>เปลี่ยนแล้วบันทึกอัตโนมัติบนเครื่องนี้</span>
            </div>
            <span className="theme-picker-dot" aria-hidden="true" />
          </div>

          <div className="theme-picker-group">
            <span className="theme-picker-label" id="theme-picker-tone">โทนสี</span>
            <div className="theme-picker-presets" role="group" aria-labelledby="theme-picker-tone">
              {themePresets.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`theme-picker-preset ${preset === item.value ? 'selected' : ''}`}
                  onClick={() => setPreset(item.value as ThemePreset)}
                  aria-pressed={preset === item.value}
                >
                  <span className="theme-picker-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                  <span className="theme-picker-preset-name">{item.label}</span>
                  {preset === item.value && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/*
            A three-way choice shown as three buttons rather than a dropdown: every option is
            readable without opening anything, and the one in force is visible at a glance, which is
            the whole point of a setting somebody is fiddling with to see what it looks like.
          */}
          <div className="theme-picker-group">
            <span className="theme-picker-label" id="theme-picker-mode">โหมดหน้าจอ</span>
            <div className="theme-picker-modes" role="group" aria-labelledby="theme-picker-mode">
              {themeModes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={mode === item.value ? 'selected' : ''}
                  onClick={() => setMode(item.value as ThemeMode)}
                  aria-pressed={mode === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`theme-picker-switch ${motion === 'full' ? 'on' : ''}`}
            onClick={() => setMotion(motion === 'full' ? 'reduced' : 'full')}
            aria-pressed={motion === 'full'}
          >
            <span className="theme-picker-switch-copy">
              <strong>การเคลื่อนไหว</strong>
              <span>{motion === 'full' ? 'เปิดลูกเล่นแอนิเมชัน' : 'ลดการเคลื่อนไหวลง'}</span>
            </span>
            <span className="theme-picker-switch-track" aria-hidden="true"><span /></span>
          </button>
        </div>
      )}
    </div>
  );
}
