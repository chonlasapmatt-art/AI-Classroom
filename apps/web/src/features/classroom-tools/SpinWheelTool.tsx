import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Student } from '../../domain/types';
import { Badge, Button, EmptyState } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { pickNextStudent } from '../classroom/classroomGames';
import styles from './classroomTools.module.css';

/** How long the disc takes to come to rest. Long enough for a room to shout, short enough to teach past. */
const SPIN_MS = 4200;

/** The wheel's own colours, cycled. Deliberately not the six a child can tint an avatar with. */
const SEGMENT_COLOURS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#F43F5E', '#0EA5E9', '#EAB308', '#6366F1'];

/**
 * The name draw, as a wheel the room can watch.
 *
 * ── Why a wheel rather than a button that prints a name ──
 * The board already has a picker and it works; what it does not do is let thirty people watch the
 * decision being made. A name that appears has to be trusted; a name the wheel stops on is one the
 * room saw arrive. That is the whole of the difference, and it is the reason this exists.
 *
 * ── The draw is honest, and the drawing follows it ──
 * The student is chosen first — by `pickNextStudent`, the same rule the board uses, which gives
 * everybody a turn before anybody gets a second — and the angle is then computed to land on them.
 * The alternative, spinning to a random angle and reading off whoever is under the pointer, cannot
 * promise the no-repeats property, which is the property that makes a class accept it as fair.
 */
export function SpinWheelTool({ roster, className }: { roster: Student[]; className: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [winner, setWinner] = useState<Student | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The faces on the disc.
   *
   * A class of forty on one wheel is forty unreadable slivers, so the disc shows at most sixteen and
   * says so; the draw itself still runs over the whole roster. A wheel that shows some of the room
   * and picks from all of it is honest as long as it admits the first half, which the caption does.
   */
  const shown = useMemo(() => roster.slice(0, 16), [roster]);
  const segmentAngle = shown.length > 0 ? 360 / shown.length : 360;

  function spin() {
    if (spinning || roster.length === 0) return;
    const result = pickNextStudent(roster.map((student) => student.id), picked);
    const chosen = roster.find((student) => student.id === result.studentId) ?? null;
    if (!chosen) return;

    setSpinning(true);
    setWinner(null);
    setPicked(result.picked);

    /*
     * Where the disc has to stop.
     *
     * The pointer is at twelve o'clock, so landing segment `index` under it means turning the disc
     * back by that segment's own middle. Four whole turns are added on top so it reads as a spin
     * rather than as a jump, and the angle only ever increases — winding backwards would make the
     * wheel briefly turn the wrong way when the next pick sits earlier in the list.
     */
    const index = shown.findIndex((student) => student.id === chosen.id);
    const seat = index >= 0 ? index : Math.floor(Math.random() * Math.max(1, shown.length));
    const target = 360 - (seat * segmentAngle + segmentAngle / 2);
    const turns = 4 * 360;
    setAngle((current) => current + turns + ((target - (current % 360)) + 360) % 360);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setWinner(chosen);
      setSpinning(false);
    }, SPIN_MS);
  }

  function reset() {
    setPicked([]);
    setWinner(null);
  }

  if (roster.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="students" size={28} />}
        title="ห้องนี้ยังไม่มีรายชื่อนักเรียน"
        description="เลือกห้องที่มีนักเรียนอยู่ หรือเพิ่มนักเรียนเข้าห้องก่อนเริ่มสุ่ม"
      />
    );
  }

  const remaining = roster.length - picked.length;
  const discStyle = { '--spin-angle': `${angle}deg`, '--spin-ms': `${SPIN_MS}ms` } as CSSProperties;

  return (
    <div className={`${styles.wheelStage} ${className}`}>
      <div className={styles.wheelFrame}>
        <div className={styles.wheelPointer} aria-hidden="true" />
        <svg viewBox="0 0 200 200" className={styles.wheelDisc} style={discStyle} aria-hidden="true">
          {shown.map((student, index) => {
            const start = index * segmentAngle;
            const end = start + segmentAngle;
            const large = segmentAngle > 180 ? 1 : 0;
            const point = (degrees: number) => {
              const radians = ((degrees - 90) * Math.PI) / 180;
              return `${100 + 96 * Math.cos(radians)} ${100 + 96 * Math.sin(radians)}`;
            };
            /*
             * The name reads along its own spoke, from the rim inwards.
             *
             * Laid out flat and merely placed at the segment's midpoint, sixteen names all run
             * left-to-right through the middle of the disc and cross each other into an unreadable
             * knot — which is what the first cut did. Turning the whole label group so the segment
             * points right, then writing the name ending at the rim, gives every name the same
             * amount of room and the same reading direction as the spoke it belongs to.
             */
            const mid = (start + end) / 2;
            return (
              <g key={student.id}>
                <path
                  d={`M100 100 L${point(start)} A96 96 0 ${large} 1 ${point(end)} Z`}
                  fill={SEGMENT_COLOURS[index % SEGMENT_COLOURS.length]}
                />
                {/* On the left half the same spoke points away from the reader, so the label is
                    turned over and written from the other end: upside-down names on half a wheel are
                    the thing a class notices first. */}
                <g transform={`rotate(${mid - 90} 100 100)`}>
                  {mid > 180 ? (
                    <text
                      className={styles.wheelName}
                      x="14" y="100" textAnchor="start"
                      transform="rotate(180 100 100)"
                    >
                      {student.displayName.split(' ')[0]?.slice(0, 9)}
                    </text>
                  ) : (
                    <text className={styles.wheelName} x="186" y="100" textAnchor="end">
                      {student.displayName.split(' ')[0]?.slice(0, 9)}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
        <div className={styles.wheelHub}>{spinning ? 'กำลังหมุน' : 'หมุนเลย'}</div>
      </div>

      <div className={styles.winner} role="status" aria-live="polite">
        {winner ? (
          <>
            <span className={styles.winnerName}>{winner.displayName}</span>
            <span className={styles.winnerMeta}>เลขประจำตัว {winner.studentCode}</span>
          </>
        ) : (
          <span className={styles.winnerMeta}>
            {spinning ? 'วงล้อกำลังหมุน…' : 'กดหมุนเพื่อเลือกนักเรียนออกมาหน้าห้อง'}
          </span>
        )}
      </div>

      <div className={styles.toolbar}>
        <Button variant="primary" onClick={spin} disabled={spinning}>
          {spinning ? 'กำลังหมุน…' : 'หมุนวงล้อ'}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={spinning || picked.length === 0}>
          เริ่มรอบใหม่
        </Button>
        <Badge tone="info">เหลือยังไม่ถูกเรียก {remaining} คน</Badge>
        {shown.length < roster.length && (
          <span className={styles.winnerMeta}>
            วงล้อแสดง {shown.length} ชื่อแรก แต่สุ่มจากทั้งห้อง {roster.length} คน
          </span>
        )}
      </div>
    </div>
  );
}
