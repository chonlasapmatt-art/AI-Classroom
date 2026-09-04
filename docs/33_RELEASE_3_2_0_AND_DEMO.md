# Release 3.2.0 — what shipped, how to demo it, and how to pick the work back up

## 1. Why the live site looked older than the code

The deployment, not the code. Production on Vercel was last promoted two days before this release;
everything built since then existed only on the development machine. That is what "the outside one
has no admin button" was — an older bundle, still being served, still holding its own cached copy in
every browser that had opened it.

Two things follow from that, and both are part of releasing:

* **A build is not a deployment.** `npm run build` produces `apps/web/dist`; production changes only
  when that is promoted (`vercel deploy --prod`, or a push to the branch the project builds).
* **Edge Functions deploy separately from the web app.** `supabase functions deploy <name>` is its
  own step, and a function edited in this repository is not live until it runs.

Checklist for "is the live site current?":

```bash
npx vercel ls                       # newest Production deployment should be today's
npx supabase migration list --linked   # every local migration should have a remote counterpart
npx supabase functions list --project-ref <ref>   # updated_at should not predate the last edit
```

## 2. Which door each account uses

Every account is created by a school administrator. There is no public sign-up, so a name that was
never entered by an admin cannot sign in anywhere — and the sign-in screen says the same thing to a
wrong name and a wrong password on purpose, so it cannot be used to find out which accounts exist.

| Who | Where | What to type |
| --- | --- | --- |
| ผู้ดูแลโรงเรียน (admin) | `/admin-access` | ชื่อ + รหัสผ่านที่ตั้งไว้ตอนตั้งค่าโรงเรียน |
| ครู | `/login` → ครู | ชื่อครู + **รหัสครู** (ไม่ใช่รหัสผ่าน) จากหน้า `/teachers` |
| นักเรียน | `/login` → นักเรียน | ชื่อนักเรียน + **เลขประจำตัวนักเรียน** จากหน้า `/students` |
| ผู้ปกครอง | `/login` → ผู้ปกครอง | ชื่อผู้ปกครอง + รหัสผ่านที่แอดมินตั้งให้ |
| ผู้ดูแลแพลตฟอร์ม | `/platform/` | รหัสเข้าใช้งานของเซิร์ฟเวอร์ + MFA |

The name has to match what the admin saved, allowing for spacing and case only. "ครูสมชาย ใจดี" and
"สมชาย ใจดี" are two different names to the server.

If nobody can sign in at all, work down this list in order:

1. Is the page the current build? Check the version in ตั้งค่า → เวอร์ชันและการอัปเดต.
2. Does the admin door work (`/admin-access`)? If it does, read the exact ชื่อ/รหัสครู/เลขประจำตัว
   off `/teachers` and `/students` — those pages are the source of truth for what to type.
3. Locked out after several tries? The message says so and names the wait; it is per name and per
   device, and it clears itself.
4. Admin password lost? Reset it from `/platform/` — nobody, including a platform operator, can read
   an existing password back.

## 3. What is new in 3.2.0

* **กิจกรรมหน้าชั้น (`/classroom`)** — random student, random teams, random question, countdown, and
  one-tap XP and badges. See `docs/32_CLASSROOM_LIVE_TOOLS.md`.
* **เมนูรายบทบาท** — each role gets its own sections, named for what that person came to do, with a
  menu search box.
* **รายงานของนักเรียนและผู้ปกครอง** — attendance, work, points and badges for one person, CSV export.
* **Sync สำหรับครู** — queue depth, status and a manual sync, without the restore controls.
* **หน้าเข้าสู่ระบบ** — online/offline state and the school this device last used.
* **หนึ่งบัญชี หลายโรงเรียน** — an administrator activates each campus under its own product key.
* **สิทธิ์การให้คะแนน** — a score, a mark or a badge is written only by an admin of the school or a
  teacher who teaches that student (`staff_can_award_student`), and a student can no longer write a
  score for themselves.

## 4. Demo script (10 minutes, Preview Mode)

Preview Mode carries its own fictional school, so nothing in the demo touches real data. It is
available on the live site and switches roles from the top bar.

1. เปิดเว็บ → หน้า login → ปุ่ม **เข้าสู่โหมด Preview**.
2. **ครู**: `/` วันนี้ → `/attendance` กด "มาเรียนทั้งหมด" แล้วแก้เฉพาะคนที่ผิดปกติ.
3. `/classroom` → สุ่มชื่อ → ให้ XP → สุ่มทีม → แบ่งทีม → ให้ทั้งทีม → จับเวลา.
4. `/assignments` สร้างงาน → `/scores` ให้คะแนน.
5. สลับเป็น **นักเรียน** จากแถบบน → `/` งานวันนี้ → `/reports` รายงานของฉัน.
6. สลับเป็น **ผู้ปกครอง** → `/my-children` → `/reports` รายงานของลูก.
7. สลับเป็น **แอดมิน** → `/reports` ทั้งโรงเรียน → `/operations` Sync และ Backup.

## 5. Picking the work back up

```bash
npm install
npm run dev                 # http://localhost:5173 — Preview Mode available here
npm run check               # typecheck + lint + test + build
npm run test:e2e            # unconfigured-gate suite
npm run test:e2e:student    # public entrances
```

State of the tree at 3.2.0: 68 test files / 711 tests, 2 + 40 end-to-end tests, typecheck and lint
clean. The database is level with `supabase/migrations`; nothing is pending.

Still open, in the order the master brief lists them:

* OCR for scanned rosters (images and image-only PDFs are refused with a message today).
* A restore rehearsal against a staging project, recorded in `docs/22_SECURITY_AND_ACCEPTANCE.md`.
* Teacher-facing backup status beyond the sync queue.
* The remaining reference-app polish: landing-page art direction, and per-role dashboards for
  guardians.
