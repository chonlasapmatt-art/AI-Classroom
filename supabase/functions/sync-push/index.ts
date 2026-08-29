import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

interface Mutation { idempotencyKey: string; entityType: string; entityId: string; operation: 'upsert'|'delete'; payload: Record<string,unknown>; baseVersion: number; requestHash: string; }
Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin')); if (request.method==='OPTIONS') return new Response(null,{status:204,headers}); if(request.method!=='POST') return json({code:'METHOD_NOT_ALLOWED'},405,headers);
  try {
    const { user } = clients(request); const { data: authData, error: authError } = await user.auth.getUser(); if(authError||!authData.user) return json({code:'AUTH_REQUIRED'},401,headers);
    const body = await request.json(); if(body.syncProtocolVersion!==1) return json({code:'CLIENT_UPDATE_REQUIRED',minimumSupportedProtocol:1},409,headers);
    if(!Array.isArray(body.mutations)||body.mutations.length>100) return json({code:'VALIDATION_ERROR'},400,headers);
    const { data: membership } = await user.from('school_memberships').select('id').eq('school_id',body.schoolId).eq('status','active').limit(1); if(!membership?.length) return json({code:'FORBIDDEN'},403,headers);
    const results=[]; for(const mutation of body.mutations as Mutation[]) { const { data,error }=await user.rpc('apply_sync_mutation',{p_school_id:body.schoolId,p_device_id:body.deviceId,p_idempotency_key:mutation.idempotencyKey,p_request_hash:mutation.requestHash,p_entity_type:mutation.entityType,p_entity_id:mutation.entityId,p_operation:mutation.operation,p_payload:mutation.payload,p_base_version:mutation.baseVersion}); if(error){ const conflict=error.message.includes('CONFLICT'); results.push({idempotencyKey:mutation.idempotencyKey,entityId:mutation.entityId,status:conflict?'conflict':'validation_error',code:conflict?'SYNC_CONFLICT':'MUTATION_ERROR',message:error.message}); } else results.push(data); }
    return json({requestId:body.requestId,results,serverTime:new Date().toISOString()},200,headers);
  } catch(error){ return json({code:'INTERNAL_ERROR',message:error instanceof Error?error.message:'Unknown error'},500,headers); }
});
