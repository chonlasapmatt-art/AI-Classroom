# Smart Classroom — RLS & Authorization Matrix

## Principle
Frontend guards are UX only.
RLS / PostgreSQL grants / trusted server checks are security boundaries.

## Authorization Inputs
- auth.users.id
- user_profiles
- school_memberships
- class_teachers
- student/profile mapping
- parent_student_links
- consents
- device status for critical sync

## Role Summary
### Admin
Own-school management, school-wide reporting, authorized audit access. No cross-school access.

### Teacher
Assigned classes only; classroom students, learning records, attendance, scores, parent invitations by policy.

### Student
Self data only: profile, own class assignments, own submissions, own scores, own attendance.

### Parent
Linked child only and only with active link + active consent.

## Entity Matrix
| Entity | Admin | Teacher | Student | Parent |
|---|---|---|---|---|
| schools | own school | limited read | limited | limited |
| user_profiles | scoped | self/limited | self | self |
| school_memberships | manage own school | self read | self read | self read |
| academic_terms | manage | assigned context read | own context | linked context |
| teachers | manage | self/allowed peers | no | no |
| classes | own school | assigned | own class limited | linked child class limited |
| students | own school | assigned class | self | linked child |
| enrollments | own school | assigned class | own | linked child |
| assignments | manage | assigned class CRUD | own class read | linked child read |
| submissions | manage | assigned class | own | linked child read |
| activities/tests | manage | assigned class CRUD | own results | linked child results |
| attendance | manage | assigned class CRUD | own | linked child |
| settings | manage | allowed scope | own prefs | own prefs |
| parent links | manage | assigned student policy | no | own |
| consents | policy view | limited | no | own |
| audit_log | authorized | limited policy | no | no |

## Recommended Trusted Helpers
- is_active_member(profile_id, school_id)
- has_school_role(profile_id, school_id, role)
- teacher_has_class_access(profile_id, class_id)
- student_owns_student_record(profile_id, student_id)
- parent_has_active_link(profile_id, student_id)
- parent_has_active_consent(profile_id, student_id)

## Required Negative Tests
1. School A cannot read School B
2. Teacher cannot access unassigned class
3. Teacher cannot mutate student outside assigned class
4. Student cannot read another student
5. Parent cannot read unlinked child
6. Parent linked but consent revoked is denied
7. Suspended membership denied
8. Local role tampering denied by server
9. Revoked device denied for critical sync

## Service Role
Never in browser. Trusted server only. Service-role operations must still perform explicit authorization.

## RPC Security
Each RPC documents purpose, caller, school scope, required role, grants, invoker/definer mode, and transaction semantics.
SECURITY DEFINER requires safe search_path, explicit auth checks, minimal privilege, restricted EXECUTE.
