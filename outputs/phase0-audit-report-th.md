# 📋 Phase 0 — รายงานตรวจสอบ: การปรับปรุงระบบ PJ Ai Smart Classroom ทั้ง Full-stack

**วันที่:** 2 กันยายน 2026
**Branch:** `continuation/claude-completion`
** Gates ปัจจุบัน:** `typecheck` ✅ | `lint` ✅ (`--max-warnings 0`) | `test` ✅ (572 ทดสอบ, 55 ไฟล์) | `build` — ยังไม่ได้รัน
**Migrations:** 57 (ล่าสุด `202609020011`)
**Edge Functions:** 15 (รวม `_shared`)
**ไฟล์โค้ดแอปพลิเคชัน:** 116 ไฟล์
**หน้าจอ (School app):** 37 routes | **หน้าจอ (Platform console):** 9 routes

---

## 1. แผนผังคลังเก็บและแผนผังหน้าจอ/เมนู

### โครงสร้างไฟล์หลัก

```
apps/web/src/
  app/              App shell, การเชื่อมโยงหน้าจอ, AuthContext, ธีม, เซสชัน, แจ้งเตือนอัปเดต
  data/             interface ของ repository, การIMPLEMENTATION Dexie + fixture, การแยกวิเคราะห์นำเข้า
  db/               Dexie schema (v13), บันทึกการเปลี่ยนแปลงภายในเครื่อง
  domain/           ประเภทข้อมูลร่วม (shared types)
  features/         28 ไดเรกทอรีฟีเจอร์ — ทุกหน้าจออยู่ที่นี่
  layouts/          AppShell (sidebar + topbar + sync pill + ตัวสลับบทบาท)
  platform/         Operations Console (entry แยก, routes แยก)
  preview/          Preview Mode (ข้อมูลจำลอง 460 บรรทัด, การสลับบทบาท)
  security/         เครื่องมือรักษาความปลอดภัย
  services/         Supabase client
  sync/             push, pull, retry, protocol contracts, engine
  ui/               components.tsx — ชุด component ร่วมชุดเดียว
  design-system/    tokens.css, global.css, components.css, screens.css
supabase/
  migrations/       57 immutable migrations
  functions/        15 Edge Functions
scripts/probes/     สคริปต์ตรวจสอบแบบ live
docs/               26 เอกสาร specification/validation
```

### แผนผังหน้าจอ — School App (`/`)

| Route | หน้า | บทบาทที่เข้าถึงได้ |
|---|---|---|
| `/` | แดชบอร์ดภาพรวม | admin, teacher, student, parent |
| `/announcements` | ประกาศรวม | admin, teacher, student, parent |
| `/calendar` | ปฏิทิน | admin, teacher, student |
| `/timetable` | ตารางสอน | admin, teacher, student, parent |
| `/notifications` | การแจ้งเตือน | student |
| `/students` | นักเรียน | admin, teacher, student |
| `/students/:studentId` | รายละเอียดนักเรียน | admin, teacher |
| `/classes` | ห้องเรียน | admin, teacher |
| `/subjects` | รายวิชา | admin, teacher |
| `/teachers` | ครู | admin |
| `/parents` | ผู้ปกครอง | admin, teacher, parent |
| `/import` | นำเข้ารายชื่อ | admin, teacher |
| `/promotion` | ปีการศึกษา | admin, teacher |
| `/attendance` | เช็กชื่อ/การเข้าเรียน | admin, teacher, parent |
| `/assignments` | งานและกิจกรรม | admin, teacher, student |
| `/scores` | คะแนนและเกรด | admin, teacher, student |
| `/gradebook` | สมุดเกรด | admin, teacher, student |
| `/grade-editor` | แก้ไขคะแนน | admin, teacher |
| `/question-bank` | คลังข้อสอบ | admin, teacher |
| `/quiz` | Quiz Challenge | admin, teacher |
| `/exams` | ข้อสอบ | admin, teacher |
| `/sit-exam` | สอบ | student |
| `/leaderboard` | Leaderboard | admin, teacher, student |
| `/achievements` | เหรียญรางวัล | admin, teacher, student, parent |
| `/my-children` | ลูกของฉัน | parent |
| `/reports` | รายงาน | admin, teacher |
| `/operations` | Sync & Backup | admin |
| `/settings` | ตั้งค่า | admin, teacher, student, parent |
| `/profile` | โปรไฟล์ | admin, teacher, student, parent |
| `/avatar-gallery` | Avatar Studio | เฉพาะ preview mode |
| `/preview-demo` | คู่มือทดสอบระบบ | เฉพาะ preview mode |

### แผนผังหน้าจอ — Platform Console (`/platform/`)

| Route | หน้า |
|---|---|
| `/` | ภาพรวมระบบ |
| `/schools` | โรงเรียน |
| `/admins` | สร้าง/จัดการ ผู้ดูแลแพลตฟอร์ม |
| `/errors` | ศูนย์ข้อผิดพลาด |
| `/notifications` | ศูนย์แจ้งเตือน |
| `/devices` | ศูนย์อุปกรณ์ |
| `/changelog` | บันทึกการเปลี่ยนแปลง |
| `/security` | ความปลอดภัยและบันทึกการตรวจสอบ |
| `/platform` | Feature Flags และ Releases |

### Route สำหรับการยืนยันตัวตน

| Route | หน้า |
|---|---|
| `/login` | เข้าสู่ระบบ (ครู/แอดมิน/ผู้ปกครอง) |
| `/admin-access` | เข้าสู่ระบบแอดมิน |
| `/owner/access` | Owner Bootstrap |
| การเข้าสู่ระบบของนักเรียน | ผ่าน `/login` (ชื่อ + รหัสนักเรียน) |

---

## 2. การตรวจสอบ Visual — สถานะปัจจุบัน

### Design System ที่มีอยู่

**จุดแข็ง:**
- ✅ มี design tokens ครบถ้วน (`tokens.css`): สี brand, ขนาด spacing (8 ระดับ), radius (6 ระดับ), elevation (4 ระดับ), typography scale (8 ระดับ), ขนาด control (3 ระดับ), motion tokens
- ✅ มี color presets 7 ชุด: Smart Violet (ค่าเริ่มต้น), Sky, Mint, Sunny, Berry, Ocean, Forest, Graphite — เปลี่ยนได้ด้วย `data-preset`
- ✅ มี Dark mode ครบถ้วน (light + dark + `prefers-color-scheme`)
- ✅ มี density presets: compact, default, spacious
- ✅ มี responsive breakpoints ที่ `1600px` (board), `1080px` (tablet), `720px` (mobile)
- ✅ ชุด Component ร่วม (`components.tsx`): Button, Card, CardHeader, PageHeader, Badge, Stat, EmptyState, ErrorState, Skeleton, Field, FieldGroup, Segmented, Modal, ProgressBar, Toolbar, DataTable, ConfirmDialog, Tooltip, IconButton, LinkButton
- ✅ ภาษาไทยเป็นหลัก ทุก label เป็นภาษาไทย

**จุดอ่อน / ปัญหาที่พบ:**
- ⚠️ **CSS สองชุดทับกัน**: `global.css` มี styles ซ้ำกับ `screens.css` และ `components.css` — มี `.app-frame`, `.sidebar`, `.topbar`, `.page-content` ที่นิยามซ้ำกันในทั้งสองไฟล์ ทำให้ดูแลรักษายากและเกิด specificity conflict
- ⚠️ **ไม่มี CSS custom properties สำหรับ `prefers-reduced-motion`**: ไม่พบ `@media (prefers-reduced-motion: reduce)` ที่จะปิด animation ทั้งหมด
- ⚠️ **ไม่มี Toast component ในชุดร่วม**: มี `.toast` class ใน CSS แต่ไม่มี `<Toast>` component ใน `components.tsx` — ต้องทำ inline
- ⚠️ **ไม่มี Drawer component**: Modal มี แต่ Drawer (panel ที่เลื่อนเข้ามาจากด้านข้าง) ยังไม่มี
- ⚠️ **ไม่มี Tab component แยก**: Segmented มี แต่ Tabs ที่มี panels ยังไม่มี
- ⚠️ **ไม่มี Loading overlay / full-page skeleton pattern**: มี `Skeleton` แต่ไม่มี standard page-level loading state
- ⚠️ **ไม่มีระบบ Snackbar / notification toast**: มี notification center page แต่ไม่มี real-time toast
- ⚠️ **ไม่มี Breadcrumb component**
- ⚠️ **ไม่มี Pagination component**: ตารางใช้ full load ไม่มี pagination/virtualization
- ⚠️ **ไม่มี Drag-and-drop สำหรับการเรียงลำดับ**

### ปัญหาหน้าจอหลัก

**หน้าเข้าสู่ระบบ / การยืนยันตัวตน:**
- ✅ มีหน้าเข้าสู่ระบบแบบ animated ที่สวยงาม (gradient + particles + orbits + light beam)
- ✅ มี appearance customization panel (preset, dark mode, density, motion)
- ✅ การเข้าสู่ระบบของนักเรียนมี UI แยกต่างหาก (target ใหญ่กว่า, สีอบอุ่นกว่า)
- ⚠️ ไม่มี "ลืมรหัสผ่าน" flow ที่ทำงานจริง (redirect กลับ login)

**แดชบอร์ด:**
- ✅ มี hero card, stat grid, timeline, insight list
- ✅ แดชบอร์ดนักเรียนมี subject cards, score overview
- ⚠️ ไม่มี data visualization จริง (แนวโน้มการเข้าเรียน, กราฟการกระจายคะแนน) — มีแต่ bar distribution
- ⚠️ ไม่มี "sync health" widget ที่ชัดเจน

**AppShell / การนำทาง:**
- ✅ Sidebar มี grouping ที่ collapsible, กรองตามบทบาท
- ✅ Sync pill แสดงสถานะชัดเจน (online/offline/syncing/attention/error)
- ✅ Support mode banner แสดงชัดเจน
- ✅ Role switcher สำหรับบัญชีที่มีหลายบทบาท
- ⚠️ Sidebar ไม่มีฟังก์ชันค้นหา
- ⠧ ไม่มี keyboard shortcut navigation

**ตารางข้อมูล (DataTable):**
- ✅ มี shared `DataTable` component
- ⚠️ ไม่มี sorting, filtering, pagination, virtualization built-in
- ⠧ ไม่มี bulk selection pattern
- ⚠️ ไม่มี sticky header/context

**แบบฟอร์ม:**
- ✅ มี `Field` + `FieldGroup` components
- ⚠️ ไม่มี standard form validation pattern (useForm hook หรือ類似)
- ⚠️ ไม่มี standard form submission state pattern

---

## 3. ตารางบทบาท/สิทธิ์ — เทียบกับโค้ดและ RLS

### ยืนยันแล้ว (จาก Validation Report + โค้ด)

| บทบาท | Server Authority | RLS | Code Guard | สถานะ |
|---|---|---|---|---|
| Admin | `school_memberships.role = 'admin'` + RLS | ✅ school-scoped | ✅ Nav filtering | ผ่าน |
| Teacher | `school_memberships.role = 'teacher'` + `class_teachers` assignment | ✅ assigned-class only | ✅ Nav filtering | ผ่าน |
| Student | `school_memberships.role = 'student'` + self data | ✅ self only | ✅ Nav filtering | ผ่าน |
| Parent | `school_memberships.role = 'parent'` + `parent_student_links` + consent | ✅ linked child only | ✅ Nav filtering | ผ่าน |
| Platform Operator | `platform_admins` table (ไม่ใช่ membership) | ✅ separate console | ✅ PlatformGate | ผ่าน |
| Support Mode | Server-side session + expiry + school scope | ✅ admin-only authority | ✅ Banner + role switch | ผ่าน |

### ยืนยันจาก Live Verification (Validation Report)
- ✅ `question_bank`, `question_categories`, `quiz_*`, `teacher_access_codes`, `platform_admins`, `support_sessions`, `platform_error_events` — revoked from `authenticated` entirely (ถูกเพิกถอนจากการเข้าถึง `authenticated` ทั้งหมด)
- ✅ การแยกข้ามโรงเรียนได้รับการยืนยัน live
- ✅ Teacher access code ใช้ HMAC + AES-GCM sealed
- ✅ การเข้าถึงของนักเรียนไม่ต้องใช้รหัสผ่าน พร้อม rate limiting
- ✅ Support mode ต้องมีเหตุผล (8+ ตัวอักษร), หมดอายุตาม server-side, เฉพาะ admin เท่านั้น

### ความเสี่ยงที่พบ
- ⚠️ **MFA ยังไม่มี**: ผู้ดูแลแพลตฟอร์มใช้ re-authentication ด้วยรหัสผ่านใน 15 นาที window — ไม่ใช่ second factor
- ⚠️ **Client-side role filtering**: การกรองใน Nav เป็น UX only ไม่ใช่ security boundary — ถูกต้องตาม design แต่ต้องมั่นใจว่า RLS ครอบคลุมทุก entity

---

## 4. แผนผังข้อมูล — UI → Dexie → Queue → Supabase → RPC → Edge Functions

### Local-First Mutation Flow (ยืนยันจากโค้ด)

```
การกระทำของผู้ใช้ → UI Component
  → การตรวจสอบข้อมูล (domain validation)
  → Dexie transaction (table.put + syncQueue.add ใน transaction เดียว)
  → commitLocalMutation() → announceLocalMutation() (BroadcastChannel + CustomEvent)
  → UI แสดง "บันทึกแล้ว"
  → Background sync (useBackgroundSync) → registerAndSync()
  → syncPush → Supabase Edge Function (sync-push)
  → เซิร์ฟเวอร์: JWT verify → profile → membership → device → idempotency → conflict check → domain mutation + audit + sync_changes → commit
  → คืน authoritative version + revision
  → Local queue acknowledge
```

### Read Flow (การอ่านข้อมูล)

```
UI → useSchoolSnapshot() (ข้อมูล Dexie ภายในเครื่อง)
  → Supabase Client → PostgREST → PostgreSQL RLS
  → Background pull → syncPull → server monotonic revision → local update
```

### ช่องทาง Critical Mutation

| การดำเนินการ | Dexie | PostgREST | RPC | Edge Function |
|---|---|---|---|---|
| การอ่านข้อมูลทั่วไป | cache/projection | ✅ RLS | optional | — |
| เขียนการเข้าเรียน | ✅ local-first | ❌ ไม่เขียนตรง | ✅ `apply_sync_mutation` | — |
| เขียนคะแนน | ✅ local-first | ❌ ไม่เขียนตรง | ✅ `apply_sync_mutation` | — |
| Teacher code redeem | — | — | — | ✅ `teacher-code` |
| Parent link verify | — | — | optional | ✅ `parent-link` |
| LINE notify | — | — | outbox state | ✅ `line-notify` / `notification-dispatch` |
| CSV import | preview | ❌ ไม่ bulk ตรง | helper | ✅ orchestration |
| Account provisioning | — | — | — | ✅ `admin-account`, `account-onboarding` |
| Platform access | — | — | — | ✅ `platform-access` |

### Dexie Schema (v13 — 32 tables)
- ข้อมูล domain: academicTerms, classes, teachers, classTeachers, parentLinks, subjects, students, enrollments, assignments, submissions, activities, activityScores, tests, testScores, attendance, settings, notifications, attachments, rubrics, rubricScores, submissionVersions, deadlineExtensions, announcements, notificationPreferences, academicAudit, timetable, achievements, importRuns, scoreEvents
- Sync system: syncQueue, syncState
- Local metadata: localSessions, devices

### Sync Engine
- ✅ Queue คงอยู่หลัง restart, schema upgrade, PWA update
- ✅ BroadcastChannel ปลุก tab อื่น
- ✅ Background sync: เมื่อเข้า, เมื่อ online, เมื่อ focus, visibility change, pageshow, pagehide
- ✅ Mutation debounce รวม multi-row actions (350ms)
- ✅ Retry with backoff ตาม queue's `nextRetryAt`
- ✅ Server monotonic revision
- ✅ Idempotency key + request hash
- ✅ Tombstone support
- ✅ Conflict recording (`sync_conflicts`)
- ✅ Device acknowledgement
- ✅ Protocol versioning + `CLIENT_UPDATE_REQUIRED`

---

## 5. การตรวจสอบ Sync / Offline / Security

### Sync — ผ่าน
- ✅ Queue คงอยู่หลัง restart, schema upgrade, PWA update
- ✅ BroadcastChannel ปลุก tab อื่น
- ✅ Background sync ทุกเหตุการณ์: entry, online, focus, visibility change, pageshow, pagehide
- ✅ Mutation debounce รวม multi-row actions
- ✅ Retry with backoff ตาม queue's `nextRetryAt`

### Offline — ผ่าน
- ✅ Local-first writes (Dexie transaction + queue)
- ✅ Local projection (authorized subset ไม่ใช่ cloud mirror)
- ✅ Storage persistence API (`navigator.storage`)
- ✅ PWA update preparation (ตรวจสอบ pending queue ก่อน reload)
- ⚠️ PIN-based offline unlock สำหรับ Teacher Board — มี UI แต่ live verification ยังไม่ครบ

### Security — ผ่าน
- ✅ ไม่มี secrets ใน client bundle
- ✅ ไม่มี `signInWithPassword` จาก UI (ออกแบบโดยไม่ใช้ email)
- ✅ HMAC + AES-GCM สำหรับ teacher codes
- ✅ Platform authority แยกจาก school membership
- ✅ Support mode server-controlled expiry + audit stamp
- ✅ การกระทำที่อันตรายต้องมีเหตุผล + re-authentication
- ✅ RLS บนทุก table ที่เปิดเผย
- ✅ ตาราง answer key ถูกเพิกถอนจาก `authenticated`
- ⚠️ ไม่มี MFA สำหรับ platform operators

---

## 6. ช่องว่างฟีเจอร์และ Production Blockers

### 🔴 Critical Blockers (ต้องแก้ก่อน production)

| # | รายการ | ผลกระทบ | สถานะ |
|---|---|---|---|---|
| 1 | **Notification outbox ไม่มี dispatcher** — `notification_outbox` เขียนแล้วแต่ไม่มี Edge Function อ่านส่งจริง | โรงเรียนจะเชื่อว่าผู้ปกครองได้รับแจ้งแต่จริงๆ ไม่ได้ส่ง | ล้มเหลว |
| 2 | **Backup ไม่เคย restore-test** — สร้างไฟล์ได้แต่ไม่เคย restore | ข้อมูลอาจสูญได้โดยไม่มี recovery path | ล้มเหลว |
| 3 | **Android ไม่มี** — ไม่มี Capacitor config, application id, signing | spec ระบุว่าต้องมี | ล้มเหลว |

### 🟠 High Priority (ควรทำก่อน pilot)

| # | รายการ | ผลกระทบ |
|---|---|---|
| 4 | **Realtime ไม่ได้ใช้** — ทุกหน้า poll ทุก 2 วินาที | ไม่ scale ถ้ามีหลายโรงเรียน |
| 5 | **Platform operator MFA** — ใช้ password re-auth ใน 15 นาที window | บัญชีที่ suspend โรงเรียนได้ควรมี second factor |
| 6 | **Question bank import** — พิมพ์ทีละข้อ | โรงเรียนที่มี bank อยู่แล้วจะเริ่มใช้ยาก |
| 7 | **Migrations 3 ตัวล่าสุดยังไม่ deploy** (`202609010036-38`) | Managed teacher identity + teacher responsibility enforcement |

### 🟡 Medium Priority (ควรทำก่อนเปิดใช้งาน)

| # | รายการ |
|---|---|
| 8 | Parent portal ยังไม่ครบ (attendance detail, missing work, per-subject feedback, calendar) |
| 9 | OCR import ไม่ได้ทำ (ปฏิเสธอย่างชัดเจน) |
| 10 | Practice mode ยังไม่มี |
| 11 | Question types นอกเหนือ 4 ประเภท ยังไม่มี (matching, ordering, fill-in-blank, image, audio, essay) |
| 12 | Playwright E2E suites ไม่ได้ run ใน pass ล่าสุด |
| 13 | ไม่มี cron/worker อย่างเป็นทางการ สำหรับ notification retry, stale session cleanup, backup scheduling |

---

## 7. ข้อเสนอการออกแบบระบบใหม่

### 7.1 หลักการออกแบบ

1. **Premium Intelligence** — ไม่ใช่ dashboard template; เป็น "AI Classroom Operating System" ที่ดูมั่นใจและน่าเชื่อถือ
2. **Warm & Calm** — สีนุ่ม, elevation ต่ำ, motion เบา, ไม่ทำให้เด็ก/ครูเสียสมาธิ
3. **Consistent Component Language** — ทุกหน้าใช้ชุด components เดียวกัน ไม่ invention ใหม่ per page
4. **Data-Dense but Readable** — แสดงข้อมูลมากแต่ไม่แน่น; whitespace เป็น tool
5. **Accessible First** — contrast ≥ WCAG AA, keyboard focus visible, `prefers-reduced-motion`, aria labels ครบ

### 7.2 ระบบ Token (สิ่งที่มีแล้ว + สิ่งที่ต้องเพิ่ม)

**มีแล้วดี:**
- Brand colors (7 presets), ink scale, surfaces, status colors, spacing (8), radius (6), elevation (4), type scale (8), control sizes (3), motion tokens

**ต้องเพิ่ม:**
- `--space-0`: 0 (reset)
- `--space-9`, `--space-11`, `--space-12`: ช่องว่างขนาดใหญ่สำหรับ dashboard sections
- `--radius-2xl`: 36px สำหรับ hero cards
- `--shadow-soft`: สำหรับ floating elements
- `--color-focus`: dedicated focus ring color (ไม่ใช่ brand-200)
- `--duration-instant`: 50ms สำหรับ micro-interactions
- Motion: `--motion-fade-in`, `--motion-slide-up`, `--motion-scale-in`
- `@media (prefers-reduced-motion: reduce)` — ปิด animation ทั้งหมด

### 7.3 ชุด Component (สิ่งที่ต้องเพิ่ม/ปรับ)

**ต้องเพิ่ม:**
1. **Toast / Snackbar system** — การแจ้งเตือนแบบ real-time ที่ dismiss อัตโนมัติ
2. **Drawer** — panel ที่เลื่อนเข้าจากด้านข้าง สำหรับ detail views, filters
3. **Tabs** — สำหรับ sub-navigation ในหน้า (attendance sessions, score categories)
4. **Pagination** — สำหรับตารางขนาดใหญ่
5. **DataTable enhanced** — built-in sort, filter, search, bulk select
6. **Empty state variants** — แยกตามบทบาทและบริบท
7. **Loading state** — page-level skeleton pattern
8. **Offline indicator** — inline banner ไม่ใช่แค่ sync pill
9. **Conflict resolution UI** — เปรียบเทียบทีละ field (มีแล้วแต่ต้องออกแบบให้ consistent)
10. **Form pattern** — useForm hook ที่รวม validation, submission state, error handling
11. **Search bar** — ค้นหาทั่วไปสำหรับ sidebar
12. **Breadcrumb** — สำหรับ nested routes
13. **Chip / Tag** — สำหรับ filters, status indicators

**ต้องปรับ:**
- `Modal` → เพิ่ม drawer variant, size variants (sm, md, lg, full)
- `Button` → เพิ่ม icon-only variant ที่ชัดเจน
- `Badge` → เพิ่ม dot variant สำหรับ unread
- `Skeleton` → เพิ่ม variant สำหรับ card, table, form

### 7.4 กฎเลย์เอาต์

| Breakpoint | Sidebar | เนื้อหา | Grid |
|---|---|---|---|
| ≥1600px (Board) | 272px คงที่ | fluid, max 1400px | 2 คอลัมน์ dashboard |
| 1081-1599px (Desktop) | 272px คงที่ | fluid | 2 คอลัมน์ dashboard |
| 721-1080px (Tablet) | overlay (hamburger) | เต็มความกว้าง | 1 คอลัมน์ dashboard |
| ≤720px (Mobile) | overlay (hamburger) | เต็มความกว้าง, padding compact | 1 คอลัมน์ dashboard |

### 7.5 กฎ Motion

- **ลำดับชั้น**: fade-in 150ms สำหรับเนื้อหาหน้า, slide-up 200ms สำหรับ cards
- **ผลตอบรับ**: scale(0.97) 100ms สำหรับการกดปุ่ม, scale(1.02) 150ms สำหรับ hover
- **การเปลี่ยนหน้า**: 300ms crossfade
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` ปิดทุก animation เหลือ opacity transition เท่านั้น
- **Performance**: ไม่ animate layout properties (width, height, top, left) — ใช้ transform + opacity เท่านั้น

### 7.6 พฤติกรรม Responsive

- **Board (≥1600px)**: ทุก touch target ≥56px, ข้อมูล dense ได้, sidebar เสมอ
- **Desktop**: sidebar เสมอ, 2 คอลัมน์ dashboard
- **Tablet**: sidebar overlay, 1 คอลัมน์, cards stack
- **Mobile**: sidebar overlay, padding compact, แบบฟอร์ม stack vertically, ตาราง horizontal scroll

---

## 8. แผนงานการดำเนินงานแบบ bounded

### Milestone A: Design System Foundation (สัปดาห์ที่ 1-2)
- เพิ่ม components ที่ขาด (Toast, Drawer, Tabs, Pagination, Search)
- เพิ่ม `prefers-reduced-motion` support
- เพิ่ม missing tokens
- กำจัด CSS duplication ระหว่าง global.css ↔ screens.css
- เพิ่ม page-level loading/empty/error patterns
- เพิ่ม offline banner pattern

### Milestone B: Core Pages Redesign (สัปดาห์ที่ 3-4)
- Login/Auth page polish
- Dashboard redesign พร้อม data visualization
- AppShell navigation polish (search, keyboard nav)
- หน้ารายละเอียดนักเรียน
- หน้าการเข้าเรียน (bulk actions, tablet-friendly)

### Milestone C: Learning & Assessment Pages (สัปดาห์ที่ 5-6)
- สมุดเกรด + ตัวแก้ไขเกรด
- งานและกิจกรรม + การส่งงาน
- คลังข้อสอบ + การนำเข้า
- Quiz Challenge
- หน้าข้อสอบ

### Milestone D: Operations & Parent Portal (สัปดาห์ที่ 7-8)
- Platform Console redesign
- Parent portal completion
- หน้ารายงาน
- การตั้งค่า + โปรไฟล์ + Avatar Studio

### Milestone E: Notification Sender + Backup Restore (สัปดาห์ที่ 9-10)
- Notification dispatcher Edge Function
- Backup restore drill + testing
- Sync conflict resolution UI polish

### Milestone F: Production Hardening (สัปดาห์ที่ 11-12)
- MFA สำหรับ platform operators
- Android packaging (Capacitor)
- Realtime (selective)
- E2E test suites
- Performance audit
- Accessibility audit

---

## 9. แผนไฟล์ (ความเสี่ยงและ Migration Impact)

### ไฟล์ที่จะแก้หลัก

| ไฟล์ | ความเสี่ยง | Migration |
|---|---|---|
| `design-system/tokens.css` | ต่ำ — เฉพาะเพิ่ม tokens ใหม่ | ไม่ต้อง |
| `design-system/global.css` | กลาง — กำจัด duplication | ไม่ต้อง |
| `design-system/components.css` | ต่ำ — เพิ่ม component styles | ไม่ต้อง |
| `design-system/screens.css` | กลาง — refactor layouts | ไม่ต้อง |
| `ui/components.tsx` | กลาง — เพิ่ม components ใหม่ | ไม่ต้อง |
| `layouts/AppShell.tsx` | สูง — แก้ navigation, search | ไม่ต้อง |
| `features/*/` ทุก feature page | กลาง — ปรับให้ใช้ new components | ไม่ต้อง |
| `db/database.ts` | ต่ำ — ไม่แก้ schema version | ไม่ต้อง |
| `sync/*.ts` | ต่ำ — ไม่แก้ protocol | ไม่ต้อง |
| `supabase/migrations/*.sql` | สูง — ต้อง forward-only | ต้องถ้าแก้ schema |
| `supabase/functions/notification-dispatch/` | สูง — ต้องเขียน dispatcher ใหม่ | ไม่ต้อง |

### ไฟล์ที่ห้ามแก้
- Migration ที่ deploy แล้ว (202608300001 ถึง 202609020011)
- `.env.local` (contains secrets)
- `supabase/functions/_shared/` โดยไม่เข้าใจ contract

---

## 10. แผนทดสอบและเกณฑ์ยอมรับ

### Gates ปัจจุบัน (ยืนยันแล้ว)
- ✅ `npm run typecheck` — ผ่าน (0 ข้อผิดพลาด)
- ✅ `npm run lint` — ผ่าน (0 คำเตือน)
- ✅ `npm run test` — ผ่าน (572 ทดสอบ, 55 ไฟล์)
- ⏳ `npm run build` — ยังไม่ได้รัน

### แผนทดสอบสำหรับ Redesign

**Unit Tests (เพิ่มเติม):**
- Toast component render + auto-dismiss
- Drawer open/close animation
- Tabs switching
- Pagination controls
- Search filtering
- DataTable sort/filter/bulk select
- Offline banner display logic
- `prefers-reduced-motion` toggle

**Integration Tests (เพิ่มเติม):**
- ทุกหน้ายัง render ได้หลัง redesign
- Role filtering ยังถูกต้อง
- Navigation deep-link, refresh, back button
- Mobile menu open/close
- Sync pill state transitions
- Toast notification flow

**เกณฑ์ยอมรับต่อหน้า:**
1. ทุกหน้ามี: loading state, empty state, error state, offline state, forbidden state
2. ทุกหน้าใช้ shared components จาก `ui/components.tsx` ไม่ invention ใหม่
3. ทุกหน้า responsive บน board/tablet/mobile
4. ทุกหน้า keyboard navigable
5. ทุกหน้ามี aria labels ครบ
6. ไม่มีหน้าที่แสดง placeholder/dead end
7. ไม่มี CSS class ที่ไม่ได้ใช้
8. ไม่มี unused imports

---

## 11. รายการ Decision ที่ต้องให้ Owner อนุมัติ

### 🔴 ต้องตัดสินใจก่อนเริ่มงาน

1. **CSS Architecture**: กำจัด `global.css` duplication โดยย้าย styles ไป `components.css` + `screens.css` หรือรวมเป็นไฟล์เดียว?
   - แนะนำ: กำจัด duplication แต่คง 4 ไฟล์ (tokens / global / components / screens)

2. **Toast System**: ใช้ inline state (ไม่มี library) หรือเพิ่ม lightweight toast library?
   - แนะนำ: ใช้ inline state + context (ไม่เพิ่ม dependency)

3. **Form Pattern**: สร้าง useForm hook ใหม่หรือใช้ react-hook-form?
   - แนะนำ: สร้าง lightweight hook ใหม่ (project ไม่มี react-hook-form)

4. **DataTable Enhancement**: เพิ่ม sort/filter/pagination ใน DataTable ปัจจุบันหรือสร้าง DataTablePro แยก?
   - แนะนำ: enhance DataTable เดิม

5. **Notification Dispatcher Priority**: ทำ notification sender ก่อน redesign หรือหลัง?
   - แนะนำ: ทำก่อน (production blocker)

6. **Backup Restore Drill**: ต้องการ test กับ Supabase real project หรือ mock?
   - แนะนำ: mock + ยอมรับว่า live test ต้องทำตอน deploy

7. **Android Packaging**: ต้องการ Capacitor หรือ PWA-to-APK wrapper?
   - แนะนำ: Capacitor (spec ระบุ)

8. **Realtime**: ใช้ Supabase Realtime channels หรือ WebSocket custom?
   - แนะนำ: Supabase Realtime (มีอยู่แล้วใน stack)

---

**สรุป:** โปรเจกต์มี architecture ที่แข็ง, security model ที่ดี, local-first sync ที่ทำงานจริง, design system foundation ที่มีคุณภาพ แต่ต้องการ visual redesign ระดับ premium, completion ของ notification/backup, Android packaging, และ production hardening ก่อนจะประกาศ production ready

**สถานะ: CONDITIONALLY READY** — ไม่พร้อม production ขณะที่ notification ไม่ส่ง, backup ไม่ restore-test, ไม่มี Android
