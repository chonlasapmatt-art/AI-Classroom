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
