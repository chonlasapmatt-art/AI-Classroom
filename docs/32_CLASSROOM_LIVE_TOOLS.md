# Classroom live tools

The board a teacher runs the room from: pick a name, split into teams, put a question up, start a
clock, and hand out points without leaving the screen.

Route `/classroom`, in the menu as **กิจกรรมหน้าชั้น**, open to `admin` and `teacher`.

## What it is for

The rest of the product is used sitting down. This screen is used standing up, in front of thirty
students, with about ten seconds of attention to spend. Everything on it follows from that:

* One thing large in the middle, controls beneath it at board touch-target size.
* No step that needs a name typed, a date chosen or a dialog dismissed.
* Nothing to set up first. Choose a class, and the tools work.

## The four tools

| Tool | What it does | What decides the outcome |
| --- | --- | --- |
| สุ่มชื่อ | Puts one student on the board | `pickNextStudent` — never repeats anybody until the whole class has had a turn |
| สุ่มทีม | Splits the room into 2–6 teams | `splitIntoTeams` — shuffles first, then deals, so sizes differ by at most one |
| สุ่มคำถาม | Draws from the question bank | `pickNextIndex` — works through the bank before repeating, answer revealed only on request |
| จับเวลา | A countdown the room can read | Device clock; nothing is recorded, so no server time is needed |

The picking rules live in `apps/web/src/features/classroom/classroomGames.ts`, apart from the
screen, with the randomness passed in — which is what lets the tests pin them. Drawing with
replacement is what a plain `Math.random()` over a roster does, and in a class of thirty it calls
the same student twice within a few draws often enough that the room stops believing the board is
fair.

## What is kept, and what is not

**Not kept:** the pick order, the teams, the questions already asked, the clock. They last as long
as the lesson does. A pick order that outlived the lesson would be a promise the product cannot keep
the moment a student is absent, and the class can see for itself whose turn it was.

**Kept:** points and badges. Both are written through the same audited path as every other award —
a local transaction, then the sync queue, then `apply_sync_mutation` — so an award made on a
classroom wifi that has dropped is queued and replayed exactly like an attendance mark.

* Points are `score_events` rows with `category = 'participation'` and `source_type = 'board'`,
  carrying who gave them, to whom, in which class and subject, why, and when.
* Badges are `student_achievements` rows, deduplicated by identity, so the same badge awarded twice
  is one badge.

## XP is not a mark

Nothing on this screen writes to the gradebook. Board points are participation, and turning
participation into a subject grade stays a separate, deliberate act on the score screens. That
separation is what keeps a lively lesson from quietly moving somebody's report card.

## Who may award

The server decides, not the screen. `staff_can_award_student` admits an admin of the school, and a
teacher who teaches the student — an active enrollment in a class the teacher has access to, and,
when the award names a class, that class. A teacher or a parent who reaches the URL is refused; a
student sees a screen that says the tools are for staff. See
`supabase/migrations/202609040001_awards_stay_with_the_teacher.sql`.

## Accessibility on a board

* Every control clears the 56px touch target the design system sets for board-sized screens.
* The spotlight and the celebration are `aria-live` regions, so the name and the award are announced
  rather than only shown.
* The correct answer is marked with a tick as well as a colour.
* `prefers-reduced-motion` turns off the shuffle and the celebration animation; nothing needed to
  run the lesson depends on either.

## Tests

| File | What it holds |
| --- | --- |
| `apps/web/tests/unit/classroomGames.test.ts` | The picking rules: no repeat before the round ends, balanced teams, the question pool, the clock format |
| `apps/web/tests/integration/classroomLive.test.tsx` | The screen: the tools are present, teams are real, the board is out of a student's menu and refuses a student who reaches it directly |
| `apps/web/tests/integration/scoreEvents.test.ts` | Who the sync boundary lets write a score or a badge |
