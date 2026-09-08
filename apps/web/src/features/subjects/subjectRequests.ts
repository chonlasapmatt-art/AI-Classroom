import { requireSupabase } from '../../services/supabase';

/**
 * Questions a guardian asks about a subject.
 *
 * These live on the server rather than in the local projection, and that is deliberate: a request
 * is not part of the school's own record — it is correspondence, read once and closed — so it does
 * not belong in the sync protocol, in a backup, or in the offline database on a shared classroom
 * tablet. A device with no connection simply cannot ask and cannot read, which is honest.
 *
 * The routines behind these decide who may write and who may read; nothing here is trusted with
 * that. The asker is always whoever is signed in, never a name this file could put in a payload.
 */
export interface SubjectRequest {
  id: string;
  subjectId: string;
  studentId: string | null;
  raisedByName: string;
  body: string;
  status: 'open' | 'handled';
  createdAt: string;
  handledAt: string | null;
}

interface SubjectRequestRow {
  id: string;
  subject_id: string;
  student_id: string | null;
  raised_by_name: string;
  body: string;
  status: string;
  created_at: string;
  handled_at: string | null;
}

function toRequest(row: SubjectRequestRow): SubjectRequest {
  return {
    id: row.id,
    subjectId: row.subject_id,
    studentId: row.student_id,
    raisedByName: row.raised_by_name,
    body: row.body,
    status: row.status === 'handled' ? 'handled' : 'open',
    createdAt: row.created_at,
    handledAt: row.handled_at
  };
}

/** Every request this account may read, newest first. The row policy decides what that is. */
export async function listSubjectRequests(schoolId: string, subjectId?: string): Promise<SubjectRequest[]> {
  let query = requireSupabase()
    .from('subject_requests')
    .select('id, subject_id, student_id, raised_by_name, body, status, created_at, handled_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (subjectId) query = query.eq('subject_id', subjectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as SubjectRequestRow[]).map(toRequest);
}

export async function raiseSubjectRequest(input: {
  schoolId: string; subjectId: string; studentId: string | null; body: string;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('raise_subject_request', {
    p_school_id: input.schoolId,
    p_subject_id: input.subjectId,
    p_student_id: input.studentId,
    p_body: input.body
  });
  if (error) throw new Error(error.message);
}

export async function handleSubjectRequest(schoolId: string, requestId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('handle_subject_request', {
    p_school_id: schoolId, p_request_id: requestId
  });
  if (error) throw new Error(error.message);
}
