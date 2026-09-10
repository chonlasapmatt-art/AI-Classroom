import { patch } from './patchlib.mjs';
const file = 'apps/web/src/app/WhatsNewNotice.tsx';

const stateOld = `export function WhatsNewNotice() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(NOTICE_SECONDS);
  const paused = useRef(false);`;

const stateNew = `export function WhatsNewNotice() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [remaining, setRemaining] = useState(NOTICE_SECONDS);
  const paused = useRef(false);`;

const bodyOld = `  if (!open || notes.length === 0) return null;

  const changes = changesIn(notes);
  const headline = notes[0]?.headline ?? 'อัปเดตเรียบร้อย';`;

const bodyNew = `  if (!open || notes.length === 0) return null;

  /*
   * Four lines, then the rest on request.
   *
   * The comment at the top of this file says "long enough to read four lines", and for a single
   * release that was true. A device that has been switched off for a fortnight is several versions
   * behind, and \`changesIn\` flattens every one of them: coming from 3.3.0 to 3.4.0 produced a
   * seventeen-item wall under a ten-second clock — a length nobody reads, on a timer nobody can
   * beat, which is the same as saying nothing at all.
   *
   * So the notice shows the newest release's first few changes and offers the rest. Opening them
   * also stops the clock, because somebody who asked to read more has said they are reading.
   */
  const headline = notes[0]?.headline ?? 'อัปเดตเรียบร้อย';
  const changes = changesIn(notes);
  const shown = expanded ? changes : changes.slice(0, PREVIEW_CHANGES);
  const hidden = changes.length - shown.length;`;

const constOld = `const NOTICE_SECONDS = 10;`;
const constNew = `const NOTICE_SECONDS = 10;
/** How many changes fit under a ten-second clock. The rest are one press away. */
const PREVIEW_CHANGES = 4;`;

const timerOld = `  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;`;
const timerNew = `  useEffect(() => {
    if (!open || expanded) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;`;

patch(file, [[constOld, constNew], [stateOld, stateNew], [bodyOld, bodyNew], [timerOld, timerNew]]);
console.log('notice shows four, offers the rest, and stops the clock when opened');
