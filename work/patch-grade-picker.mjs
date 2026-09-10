import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/grades/GradeEditorPage.tsx';

/* ── The counts each piece of work carries in the picker ── */
const worksOld = `  const works = useMemo(() => snapshot.assignments
    .filter((item) => item.classId === selectedClassId && item.status !== 'draft' && item.status !== 'cancelled')
    .filter((item) => membership.role !== 'teacher' || teacherCanEditSubject(snapshot, membership.profileId, item.classId, item.subjectId))
    .sort((a, b) => (b.dueAt ?? b.assignedAt).localeCompare(a.dueAt ?? a.assignedAt)),
    [membership.profileId, membership.role, snapshot, selectedClassId]);`;

const worksNew = `  const works = useMemo(() => snapshot.assignments
    .filter((item) => item.classId === selectedClassId && item.status !== 'draft' && item.status !== 'cancelled')
    .filter((item) => membership.role !== 'teacher' || teacherCanEditSubject(snapshot, membership.profileId, item.classId, item.subjectId))
    .sort((a, b) => (b.dueAt ?? b.assignedAt).localeCompare(a.dueAt ?? a.assignedAt)),
    [membership.profileId, membership.role, snapshot, selectedClassId]);

  /**
   * What each piece of work looks like before it is opened.
   *
   * Choosing what to mark was a dropdown of titles, so the one question a teacher sits down with --
   * which of these still needs marking -- could only be answered by opening each in turn. Every
   * piece of work now carries its own subject and its own two counts, which is the same shape the
   * work list already uses on the assignments screen, so the two read alike.
   */
  const workCards = useMemo(() => works.map((item) => {
    const handedIn = snapshot.submissions.filter((row) =>
      row.assignmentId === item.id && row.submittedAt && !row.deletedAt);
    const unmarked = handedIn.filter((row) => row.score === null).length;
    return {
      work: item,
      subject: subjectById(snapshot, item.subjectId),
      handedIn: handedIn.length,
      unmarked
    };
  }), [snapshot, works]);`;

/* ── The picker itself ── */
const pickerOld = `        <Field label="งานที่ต้องการให้คะแนน">
          <select value={work?.id ?? ''} onChange={(event) => { setWorkId(event.target.value); setDrafts({}); }}>
            {works.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · เต็ม {item.maxScore}
              </option>
            ))}
          </select>
        </Field>
      </Toolbar>`;

const pickerNew = `      </Toolbar>

      {workCards.length > 0 && (
        <div className="assignment-work-picker" role="tablist" aria-label="เลือกงานที่จะให้คะแนน">
          {workCards.map((card) => (
            <button
              key={card.work.id}
              type="button"
              role="tab"
              aria-selected={card.work.id === work?.id}
              className={card.work.id === work?.id ? 'is-active' : ''}
              onClick={() => { setWorkId(card.work.id); setDrafts({}); }}
            >
              <span>{card.work.title}</span>
              <small>
                {card.subject ? \`\${card.subject.name} · \` : ''}เต็ม {card.work.maxScore} คะแนน
              </small>
              {/* The number somebody came here to act on, said before the work is opened. */}
              <small className={card.unmarked > 0 ? 'grade-picker-todo' : 'grade-picker-done'}>
                {card.handedIn === 0
                  ? 'ยังไม่มีใครส่ง'
                  : card.unmarked > 0
                    ? \`รอตรวจ \${card.unmarked} จาก \${card.handedIn} ที่ส่งแล้ว\`
                    : \`ตรวจครบแล้ว \${card.handedIn} คน\`}
              </small>
            </button>
          ))}
        </div>
      )}`;

patch(file, [[worksOld, worksNew], [pickerOld, pickerNew]]);
console.log('grade editor picks work from cards that say what still needs marking');
