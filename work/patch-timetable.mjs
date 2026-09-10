import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/timetable/TimetablePage.tsx';

const old = `          {view === 'week' ? (
            /*
              A day per column, a period per row.
              This is the orientation that fits: five columns and a period rail come in under the
              width of the content area, so the week is a grid that is simply there rather than a
              wide table dragged past a pinned column.
            */
            <table className="timetable-week">
              <thead>
                <tr>
                  <th scope="col" className="timetable-week-corner">คาบ</th>
                  {teachingDays.map((day) => (
                    <th key={day} scope="col" className={day === today ? 'is-today' : undefined}>
                      {dayNames[day - 1]}
                      <span>{day === today ? 'วันนี้' : \`\${lessonsPerDay.get(day) ?? 0} คาบ\`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period}>
                    <th scope="row" className="timetable-week-period">
                      คาบ {period}
                      <span>{periodClock[period]?.startTime}–{periodClock[period]?.endTime}</span>
                    </th>
                    {teachingDays.map((day) => {
                      const entry = slots.get(\`\${day}-\${period}\`) ?? null;
                      return (
                        <td
                          key={day}
                          className={slotClassName(entry, 'slot')}
                          data-day={dayNames[day - 1]}
                          data-period={period}
                          onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                          onDrop={canEdit ? (event) => drop(event, day, period) : undefined}
                        >
                          {slotControl(entry, day, period, false)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (`;

const neu = `          {view === 'week' ? (
            /*
              A day per row, a period per column, read left to right.
              This is how the paper timetable on a staffroom wall is written and how everybody in
              the school already reads one: find your day down the left, then run your eye across
              the periods. The previous orientation had it the other way round for a width reason --
              eight period columns are wider than five day columns -- and the width reason is solved
              here by letting the table scroll inside its own frame rather than by transposing the
              week away from the shape people expect. The page itself never scrolls sideways; the
              day rail stays put while the periods move under it, so a lesson can never end up
              hidden behind the day it belongs to.
            */
            <div className="timetable-week-frame">
              <table className="timetable-week timetable-week--days-down">
                <thead>
                  <tr>
                    <th scope="col" className="timetable-week-corner">วัน / คาบ</th>
                    {periods.map((period) => (
                      <th key={period} scope="col">
                        คาบ {period}
                        <span>{periodClock[period]?.startTime}–{periodClock[period]?.endTime}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teachingDays.map((day) => (
                    <tr key={day}>
                      <th scope="row" className={\`timetable-week-day\${day === today ? ' is-today' : ''}\`}>
                        {dayNames[day - 1]}
                        <span>{day === today ? 'วันนี้' : \`\${lessonsPerDay.get(day) ?? 0} คาบ\`}</span>
                      </th>
                      {periods.map((period) => {
                        const entry = slots.get(\`\${day}-\${period}\`) ?? null;
                        return (
                          <td
                            key={period}
                            className={slotClassName(entry, 'slot')}
                            data-day={dayNames[day - 1]}
                            data-period={period}
                            onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                            onDrop={canEdit ? (event) => drop(event, day, period) : undefined}
                          >
                            {slotControl(entry, day, period, false)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (`;

patch(file, [[old, neu]]);
console.log('week transposed: days down the left, periods across the top');
