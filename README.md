# AI Smart Classroom v3.1

ระบบบริหารห้องเรียนแบบ Local-first PWA สำหรับกระดาน Interactive Board และพอร์ทัล Admin, Teacher, Student, Parent ตาม Smart Classroom Master Specification v3.1

## เริ่มต้น

ต้องใช้ Node.js 22+ และ Supabase project แยกสำหรับ development/staging/production

```bash
npm install
cp .env.example apps/web/.env.local
npm run dev
```

ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน `apps/web/.env.local` แล้วรัน migrations ตามลำดับจาก `supabase/migrations/` ก่อนสร้างโรงเรียนจริงผ่าน First School Setup

## Development Preview Mode

Product Owner เปิดดู UX ได้โดยยังไม่ต้องตั้งค่า Supabase ผ่านปุ่ม **เข้าสู่โหมด Preview** บนหน้าตั้งค่า Supabase (และบนหน้า Login)

- เปิดได้เฉพาะ dev build (`import.meta.env.DEV === true`) หรือเมื่อกำหนด `VITE_ENABLE_PREVIEW_MODE=true` เท่านั้น
- ใช้ `fixtureSchoolRepository` ซึ่งเก็บข้อมูลในหน่วยความจำ ไม่แตะ Dexie, ไม่แตะ Supabase, ไม่เข้าคิว sync (มีเทสต์ยืนยัน)
- สลับบทบาท Admin/Teacher/Student/Parent ได้จากแถบบน พร้อมป้าย "Preview / Development Only"
- หน้า Avatar Gallery (`/avatar-gallery`) แสดงทุกธีมและทุกสถานะแอนิเมชัน เปิดเฉพาะโหมด Preview

```bash
# ดูแบบ production build บน http://127.0.0.1:4173/
VITE_ENABLE_PREVIEW_MODE=true npm run build
npm run preview --workspace @smart-classroom/web
```

ทุกหน้าจออ่าน/เขียนข้อมูลผ่านชั้น data-access เดียว (`src/data/schoolRepository.ts`) จึงมีสอง implementation คือ Dexie (production) และ fixture (preview) โดยเลือกที่ root เพียงจุดเดียว

## ความสามารถหลัก

- **รายวิชา** — เริ่มด้วย 8 กลุ่มสาระมาตรฐาน และเพิ่ม/แก้ไข/เก็บถาวรรายวิชาเองได้ (`/subjects`) งาน กิจกรรม และการสอบผูกกับรายวิชา
- **อวตารนักเรียน** — ประกอบจากบุคลิก สีชุด สีผิว ทรงผม ของประดับ และเข็มกลัด รวมกว่า 100 แบบ เลือกเองได้ที่ Avatar Studio
- **มอบหมายงานแบบ Classroom** — สร้างงาน มอบหมายทั้งห้อง แจ้งเตือนเฉพาะคนที่ยังไม่ส่ง นักเรียนส่งงานพร้อมไฟล์แนบ ครูให้คะแนนและส่งคืนพร้อมแจ้งเตือน
- **แลกไฟล์ครู-นักเรียน** — PDF, Excel (.xlsx), CSV, เอกสาร และรูปภาพ (ไม่เกิน 15 MB ต่อไฟล์) ครูแจกเอกสารให้ทั้งห้องพร้อมแจ้งเตือน นักเรียนส่งงานแนบไฟล์กลับ ไฟล์เก็บใน Dexie ของเครื่อง และมิเรอร์ขึ้น Supabase Storage bucket `classroom-files` (private) เพื่อให้เครื่องอื่นดาวน์โหลดได้ตาม RLS
- **นำเข้ารายชื่อ** — นักเรียน ครู ผู้ปกครอง จาก CSV/TSV/Excel แก้ไขและลบแถวได้ก่อนบันทึก (`/import`)
- **สมุดเกรด** — ตารางเกรดแยกตามรายวิชา การกระจายเกรด GPA 4.00 และใบรายงานผลรายบุคคล (`/gradebook`)

## ระบบงานวิชาการ (v3.2)

- **งานและโปรเจกต์** — ประเภทงาน (การบ้าน/งานที่มอบหมาย/โครงงาน/กิจกรรม) ฉบับร่างไม่แจ้งเตือน เผยแพร่แล้วสร้าง submission + แผนเตือนอัตโนมัติ ยกเลิกงานได้
- **เครื่องมือเตือน** — ตัวเลือก ตอนประกาศ/7 วัน/3 วัน/1 วัน/3 ชม./1 ชม. มี dedupe key กันซ้ำ คำนวณใหม่เมื่อเลื่อนกำหนดส่ง ข้ามคนที่ส่งแล้ว และเลี่ยงช่วงเวลาเงียบ
- **ปฏิทิน** — มุมมองเดือน/สัปดาห์/กำลังจะถึง แยกตามบทบาท
- **ศูนย์การแจ้งเตือน** — จัดกลุ่ม วันนี้/ใกล้ถึงกำหนด/กำลังจะมาถึง/เลยกำหนด/เสร็จแล้ว พร้อม badge จำนวนที่ยังไม่อ่าน
- **การส่งงาน** — เก็บทุกเวอร์ชัน ขอแก้ไข ส่งใหม่ ขยายเวลาเฉพาะบุคคล และรับทราบงาน (acknowledged_at จริง)
- **การให้คะแนน** — คะแนนเดียวหรือ rubric, ตรวจช่วงคะแนน, เกรดคำนวณจาก scheme ที่ตั้งค่าได้, override ต้องมีเหตุผลและเก็บเกรดเดิมไว้
- **สมุดเกรด** — หมวด การบ้าน/งาน/กิจกรรม/โครงงาน/สอบ พร้อมน้ำหนักที่ตั้งค่าได้ และการกระจายเกรด
- **Avatar 100 แบบ** — เลือกเองได้ทั้งครู นักเรียน ผู้ปกครอง (แก้ของคนอื่นไม่ได้) มี fallback เป็นตัวอักษรย่อ
- **ความจุห้องเรียน** — preset 30/40/50/60/70/80/100 หรือกำหนดเอง พร้อมแถบแสดง 28/40 คน
- **ตรวจสอบย้อนหลัง** — บันทึก SCORE_CREATED, SCORE_CHANGED, GRADE_OVERRIDE, DEADLINE_CHANGED, STUDENT_EXTENSION_CREATED, ASSIGNMENT_PUBLISHED/CANCELLED, REVISION_REQUESTED

## คำสั่งตรวจสอบ

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

## หลักความปลอดภัย

- การเขียนข้อมูลสำคัญต้องผ่าน Dexie transaction + `sync_queue`
- Backend ใช้ PostgreSQL grants, RLS และ trusted RPC; frontend guard เป็นเพียง UX
- ไม่มี production demo data และไม่มี secret ใน repository
- การเข้าออฟไลน์ครั้งแรกถูกปฏิเสธ; Offline Unlock ใช้ได้เฉพาะ Teacher Board ที่ลงทะเบียนและยืนยันออนไลน์แล้ว

เอกสารสถาปัตยกรรม การติดตั้ง และ runbook อยู่ใน [`docs/`](docs/).
