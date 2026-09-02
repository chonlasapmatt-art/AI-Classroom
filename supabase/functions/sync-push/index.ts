import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

interface Mutation { idempotencyKey: string; entityType: string; entityId: string; operation: 'upsert'|'delete'; payload: Record<string,unknown>; baseVersion: number; requestHash: string; }

function retryableDatabaseError(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null;
  const code = String(value?.code ?? '');
  const message = String(value?.message ?? '').toUpperCase();
  return code === '40001' || code === '40P01' || code.startsWith('08') || code === '57P01'
    || message.includes('TIMEOUT') || message.includes('CONNECTION') || message.includes('TRY AGAIN');
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin')); if (request.method==='OPTIONS') return new Response(null,{status:204,headers}); if(request.method!=='POST') return json({code:'METHOD_NOT_ALLOWED'},405,headers);
  try {
    const { user } = clients(request); const { data: authData, error: authError } = await user.auth.getUser(); if(authError||!authData.user) return json({code:'AUTH_REQUIRED'},401,headers);
    const body = await request.json(); if(body.syncProtocolVersion!==1) return json({code:'CLIENT_UPDATE_REQUIRED',minimumSupportedProtocol:1},409,headers);
    if(!Array.isArray(body.mutations)||body.mutations.length>100) return json({code:'VALIDATION_ERROR'},400,headers);
    const { data: membership } = await user.from('school_memberships').select('id').eq('school_id',body.schoolId).eq('status','active').limit(1); if(!membership?.length) return json({code:'FORBIDDEN'},403,headers);
    const results=[]; for(const mutation of body.mutations as Mutation[]) {
      try {
        const rpcName = mutation.entityType === 'attendance' ? 'apply_attendance_mutation' : 'apply_sync_mutation';
        const { data,error }=await user.rpc(rpcName,{p_school_id:body.schoolId,p_device_id:body.deviceId,p_idempotency_key:mutation.idempotencyKey,p_request_hash:mutation.requestHash,p_entity_type:mutation.entityType,p_entity_id:mutation.entityId,p_operation:mutation.operation,p_payload:mutation.payload,p_base_version:mutation.baseVersion});
        if(error){
          const message = error.message ?? 'Mutation failed';
          const conflict=message.includes('CONFLICT');
          const retryable=retryableDatabaseError(error);
          results.push({idempotencyKey:mutation.idempotencyKey,entityId:mutation.entityId,status:retryable?'retryable_error':conflict?'conflict':'validation_error',code:retryable?'TEMPORARY_DATABASE_ERROR':conflict?'SYNC_CONFLICT':'MUTATION_ERROR',message});
        } else if (data) results.push(data);
        else results.push({idempotencyKey:mutation.idempotencyKey,entityId:mutation.entityId,status:'retryable_error',code:'EMPTY_MUTATION_RESPONSE',message:'Server did not return a mutation result'});
      } catch (error) {
        results.push({idempotencyKey:mutation.idempotencyKey,entityId:mutation.entityId,status:'retryable_error',code:'MUTATION_EXCEPTION',message:error instanceof Error?error.message:'Mutation failed'});
      }
    }
    return json({requestId:body.requestId,results,serverTime:new Date().toISOString()},200,headers);
  } catch(error){ return json({code:'INTERNAL_ERROR',message:error instanceof Error?error.message:'Unknown error'},500,headers); }
});
