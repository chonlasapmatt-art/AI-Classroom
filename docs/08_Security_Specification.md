# Smart Classroom — Security Specification v1.0

## Objectives
1. Student data confidentiality
2. Data integrity
3. Correct authorization
4. Auditability
5. Availability
6. Recoverability

## Secrets
Never expose in client:
- Supabase service role
- LINE channel secret
- LINE access token
- HMAC/pepper secret
- private service credentials

Never commit secrets to Git.

## Authentication
Use Supabase Auth.
Support session refresh, logout, suspended account denial, membership enforcement.
Admin MFA is recommended as production requirement.

## RLS
RLS ON for exposed business tables.
Automated negative tests required.

## Validation
Critical input validated on both client and server.
Client validation is not security boundary.

## XSS
Avoid unsafe HTML injection. Any rich text requires approved sanitization strategy.

## Headers
Production:
- CSP
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- HTTPS
- clickjacking protection as appropriate

## CORS
Explicit allowed origins. Avoid wildcard for privileged endpoints.

## Rate Limits
Apply to sensitive auth flows, parent link attempts, webhooks/abuse boundaries, export, privileged endpoints.

## Parent Link
6-digit code uses keyed HMAC/pepper with expiry, single use, attempt limit, rate limit, revoke, failed-attempt audit.

## Audit
Append-only, trusted-layer creation.
Never log passwords, full tokens, or secrets.

## Devices
Device ID is not a credential.
Revoked device critical sync is rejected.

## Backup
PII backup requires encryption, integrity check, schema validation, school scope validation.

## Dependency Security
CI includes dependency vulnerability scan and secret scan.
Critical/High unresolved defects block production release.

## File Upload
If submission attachments are added: validate type/size, private storage, authorization, no public bucket by default.

## Security Tests
- cross-school read
- teacher cross-class
- student cross-student
- parent unlinked child
- revoked consent
- suspended account
- modified client role
- revoked device
- idempotency abuse
- parent brute-force
- export scope bypass
