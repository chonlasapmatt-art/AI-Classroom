import { patch } from './patchlib.mjs';
const file = 'apps/web/src/app/WhatsNewNotice.tsx';

const old = `        <ul className="whats-new-list">
          {changes.map((change) => (
            <li key={change.text} data-kind={change.kind}>
              <span className="whats-new-tag">{change.kind === 'fix' ? 'แก้ไข' : 'ของใหม่'}</span>
              <span>{change.text}</span>
            </li>
          ))}
        </ul>

        <footer className="whats-new-foot">
          <span>ปิดเองใน {remaining} วินาที · ดูย้อนหลังได้ที่ ตั้งค่า · ระบบและเวอร์ชัน</span>
          <span
            className="whats-new-meter"
            aria-hidden="true"
            style={{ '--whats-new-left': \`\${(remaining / NOTICE_SECONDS) * 100}%\` } as React.CSSProperties}
          />
        </footer>`;

const neu = `        <ul className="whats-new-list">
          {shown.map((change) => (
            <li key={change.text} data-kind={change.kind}>
              <span className="whats-new-tag">{change.kind === 'fix' ? 'แก้ไข' : 'ของใหม่'}</span>
              <span>{change.text}</span>
            </li>
          ))}
        </ul>

        {hidden > 0 && (
          <button type="button" className="whats-new-more" onClick={() => setExpanded(true)}>
            ดูอีก {hidden} รายการ
          </button>
        )}

        <footer className="whats-new-foot">
          {/*
            The sentence has to match what the clock is doing. Once the list is open the countdown
            has stopped, and a panel that goes on saying "closing in 3 seconds" while sitting there
            is a small lie that teaches people not to read the rest of it.
          */}
          <span>
            {expanded
              ? 'อ่านจบแล้วกดปิดได้เลย · ดูย้อนหลังได้ที่ ตั้งค่า · ระบบและเวอร์ชัน'
              : \`ปิดเองใน \${remaining} วินาที · ดูย้อนหลังได้ที่ ตั้งค่า · ระบบและเวอร์ชัน\`}
          </span>
          {!expanded && (
            <span
              className="whats-new-meter"
              aria-hidden="true"
              style={{ '--whats-new-left': \`\${(remaining / NOTICE_SECONDS) * 100}%\` } as React.CSSProperties}
            />
          )}
        </footer>`;

patch(file, [[old, neu]]);
console.log('markup: four shown, the rest behind a press, footer tells the truth');
