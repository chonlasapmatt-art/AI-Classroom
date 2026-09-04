import { Badge, Button } from '../../ui/components';

interface Props {
  /** Only provided by development builds (or VITE_ENABLE_PREVIEW_MODE=true). */
  onEnterPreview?: () => void;
}

export function ConfigurationScreen({ onEnterPreview }: Props) {
  return (
    <main className="configuration-page">
      <section className="configuration-hero">
        <div className="brand-mark" aria-hidden="true">SC</div>
        <span className="eyebrow">AI SMART CLASSROOM v3.1</span>
        <h1>ระบบพร้อมสำหรับเชื่อมต่อ<br/><span>โรงเรียนของคุณ</span></h1>
        <p>Frontend, ฐานข้อมูล Local-first, Sync Engine และ Supabase security boundary ถูกแยกเป็นสัดส่วน พร้อมใช้กับข้อมูลโรงเรียนจริงโดยไม่มีข้อมูลสาธิตใน production</p>
        <div className="readiness-grid"><article><strong>Local-first</strong><span>Dexie + IndexedDB</span></article><article><strong>Secure Cloud</strong><span>Supabase + RLS</span></article><article><strong>Installable</strong><span>PWA + Offline shell</span></article></div>
      </section>
      <section className="configuration-card" aria-labelledby="config-title">
        <Badge tone="warning">ยังไม่ได้ตั้งค่าการเชื่อมต่อ</Badge><h2 id="config-title">เชื่อมต่อ Supabase</h2>
        <p>เพื่อรักษากฎ “First login ต้องออนไลน์” ระบบจะไม่สร้างผู้ใช้หรือข้อมูลปลอมแทน backend</p>
        <ol><li>สร้าง Supabase project สำหรับ environment นี้</li><li>รัน migrations ใน <code>supabase/migrations</code> ตามลำดับ</li><li>คัดลอก <code>.env.example</code> เป็น <code>apps/web/.env.local</code></li><li>ใส่ <code>VITE_SUPABASE_URL</code> และ <code>VITE_SUPABASE_ANON_KEY</code></li><li>รีสตาร์ต dev server แล้วเข้าสู่ระบบ</li></ol>
        <div className="security-note"><span aria-hidden="true">✓</span><p><strong>ปลอดภัยโดยค่าเริ่มต้น</strong><br/>Service role, LINE secret และ HMAC secret ไม่ถูกส่งเข้า browser</p></div>
        {onEnterPreview && (
          <div className="preview-entry">
            <Badge tone="warning">สำหรับการพัฒนาเท่านั้น — ไม่ใช่ข้อมูลจริง</Badge>
            <h3>ดู UX ก่อนตั้งค่า Supabase</h3>
            <p>โหมดตัวอย่างใช้ข้อมูลจำลองในหน่วยความจำ ไม่เชื่อมต่อ Supabase ไม่เขียนลงฐานข้อมูลจริง และไม่ส่งเข้า sync queue</p>
            <Button variant="secondary" onClick={onEnterPreview}>เข้าสู่โหมดตัวอย่าง</Button>
          </div>
        )}
      </section>
    </main>
  );
}
