# Smart Classroom — Database Specification v1.0

## Conventions
- PostgreSQL on Supabase
- UUID PKs
- timestamptz
- server-authoritative version/timestamps/security fields
- school_id tenant scoping
- versioned immutable migrations
- soft delete for sync-capable entities

## Core Tables
### schools
id, name, code, timezone(default Asia/Bangkok), status, created_at, updated_at, deleted_at.

### user_profiles
id = auth.users.id, display_name, global_status, created_at, updated_at.

### school_memberships
id, school_id, profile_id, role, status, active_from, active_until, timestamps.

### academic_terms
id, school_id, academic_year, term, starts_on, ends_on, status.

### teachers
id, school_id, profile_id, teacher_code, display_name, status, timestamps, deleted_at.

### classes
id, school_id, academic_term_id, name, grade_level, status, timestamps, deleted_at.

### class_teachers
id, school_id, class_id, teacher_id, role_in_class, active_from, active_until, created_at.

### students
id, school_id, profile_id nullable, student_code, display_name, avatar_index, status, timestamps, deleted_at.
Do not use authoritative class_id.

### student_class_enrollments
id, school_id, student_id, class_id, academic_term_id, status, enrolled_at, left_at, timestamps, deleted_at.

### parents
id, school_id, profile_id, display_name, phone nullable, line_user_id nullable, line_linked_at nullable, status, timestamps.

### parent_student_links
id, school_id, parent_id, student_id, relationship, status, consent_id, linked_at, revoked_at, timestamps.

### parent_link_invitations
id, school_id, student_id, code_hash, expires_at, max_attempts, attempt_count, used_at, revoked_at, created_by, created_at.
Never store reusable plaintext code.

### assignments
id, school_id, class_id, title, description, assigned_at, due_at, max_score, status, timestamps, version, deleted_at.

### submissions
id, school_id, assignment_id, student_id, submitted_at, status, score, is_late, teacher_note, timestamps, version, deleted_at.
Unique active: assignment_id + student_id.

### activities
id, school_id, class_id, title, activity_date, max_score, status, timestamps, version, deleted_at.

### activity_scores
id, school_id, activity_id, student_id, score, note, timestamps, version, deleted_at.
Unique active: activity_id + student_id.

### tests
id, school_id, class_id, title, test_date, max_score, status, timestamps, version, deleted_at.

### test_scores
id, school_id, test_id, student_id, score, published_at, timestamps, version, deleted_at.
Unique active: test_id + student_id.

### attendance
id, school_id, class_id, student_id, attendance_date, status, note, timestamps, version, deleted_at.
Unique active: class_id + student_id + attendance_date.

### settings
id, school_id, scope_type, scope_id, key, value_json, timestamps.

### consents
id, school_id, parent_id, student_id, consent_type, policy_version, accepted_at, revoked_at, ip_hash, user_agent_summary, created_at.

### audit_log
append-only: id, school_id, actor_profile_id, action, entity_type, entity_id, target_student_id, before_json, after_json, metadata_json, occurred_at.

### notification_preferences
id, school_id, parent_id, event toggles, quiet_period, locale, updated_at.

### notification_outbox
id, school_id, event_type, parent_id, student_id, aggregate_id, payload_json, idempotency_key, status, retry_count, next_retry_at, created_at, processed_at.
Unique: school_id + idempotency_key.

### notifications_log
id, school_id, parent_id, student_id, type, channel, status, provider_message_id, error_code, created_at, sent_at.

### devices
id, school_id, device_name, device_type, status, last_seen_at, last_successful_sync_at, last_ack_revision, revoked_at, timestamps.

### sync_changes
revision bigint monotonic, school_id, entity_type, entity_id, operation, version, changed_at.

### sync_idempotency
id, school_id, device_id, idempotency_key, request_hash, response_json, processed_at.
Unique: school_id + device_id + idempotency_key.

## Index Strategy
Index common filter/relationship columns:
school_id, academic_term_id, class_id, student_id, teacher_id, parent_id, status, deleted_at, attendance_date, due_at, sync revision.

## Migration Rules
Every schema change is a versioned SQL migration.
Never modify a production-deployed migration.
Destructive changes require backup, staging verification, compatibility and rollback/forward-fix plans.
