import { describe, expect, it } from 'vitest';
import { createPinVerifier, isOfflineGraceValid, verifyPin } from '../../src/security/offlineUnlock';
import { nextRetryDelay } from '../../src/sync/retry';
describe('offline unlock',()=>{it('never stores the raw PIN and verifies the derived value',async()=>{const record=await createPinVerifier('123456');expect(record.verifier).not.toContain('123456');expect(await verifyPin('123456',record.salt,record.verifier)).toBe(true);expect(await verifyPin('111111',record.salt,record.verifier)).toBe(false);});it('enforces the trusted grace deadline',()=>{expect(isOfflineGraceValid(new Date(Date.now()+1000).toISOString())).toBe(true);expect(isOfflineGraceValid(new Date(Date.now()-1000).toISOString())).toBe(false);});});
describe('retry schedule',()=>{it('backs off and caps',()=>{expect(nextRetryDelay(0)).toBe(5000);expect(nextRetryDelay(2)).toBe(45000);expect(nextRetryDelay(99)).toBe(900000);});});
