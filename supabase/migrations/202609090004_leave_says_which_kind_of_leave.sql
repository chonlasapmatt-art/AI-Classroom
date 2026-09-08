-- Leave says which kind of leave.
--
-- A register had four marks, and one of them — "ลา" — was doing two jobs a Thai school keeps apart:
-- ลาป่วย, which is illness, and ลากิจ, which is everything else a family asks for. The distinction
-- is not cosmetic. It is what an attendance report is read for, what a homeroom teacher rings a
-- parent about, and the reason the note field kept being used to write the word "ป่วย" by hand.
--
-- Both are added as their own values on the existing enum, rather than as a second column, because
-- a mark is one fact about one child in one period: two columns would allow "absent, sick leave"
-- and every screen would then have to decide which of the two it believed.
--
-- The old 'leave' stays. Rows already marked with it are historically true — somebody was away with
-- permission — and rewriting them would be inventing a reason the school never recorded. It reads
-- as "ลา (ไม่ระบุ)" everywhere and stops being offered as a choice.

alter type public.attendance_status add value if not exists 'leave_sick';
alter type public.attendance_status add value if not exists 'leave_personal';
