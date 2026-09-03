<#
.SYNOPSIS
  Sets up one Supabase environment for Smart Classroom: migrations, Edge Functions and secrets.

.DESCRIPTION
  Runs the whole server-side setup in the order it has to happen, and stops at the first failure
  rather than leaving an environment half-configured. Secrets are read as secure input and are
  passed straight to the Supabase CLI; this script never prints them and never writes them to disk.

  The owner code and platform operator code are separate on purpose. The former creates the first
  school; the latter enrols the first platform operator. The development one-field sign-in is
  opt-in with -EnablePlatformDevSignIn and is not enabled by the normal setup.

  Run it once per environment (development, staging, production). It is safe to re-run: migrations
  are additive and applied in order, function deploys overwrite, and secrets are replaced.

.PARAMETER ProjectRef
  The project reference from the Supabase dashboard URL:
  https://supabase.com/dashboard/project/<project-ref>

.PARAMETER SkipSecrets
  Deploy schema and functions only, leaving existing secrets untouched.

.PARAMETER PushAuthConfig
  Push the six-digit recovery OTP and email-template configuration. Hosted Free tier projects using
  the default email provider reject custom templates; configure custom SMTP before using this flag.

.EXAMPLE
  ./scripts/setup-supabase.ps1 -ProjectRef abcdefghijklmnopqrst

.EXAMPLE
  ./scripts/setup-supabase.ps1 -ProjectRef abcdefghijklmnopqrst -EnablePlatformDevSignIn
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [switch]$SkipSecrets,
  [switch]$PushAuthConfig,
  [switch]$EnablePlatformDevSignIn,
  [string]$PlatformDevOperator
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Supabase {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $displayArguments = $Arguments | ForEach-Object {
    if ($_ -match '^(PARENT_LINK_HMAC_SECRET|MEMBER_INVITATION_HMAC_SECRET|MEMBER_ACCESS_HMAC_SECRET|STUDENT_ACCESS_HMAC_SECRET|ADMIN_ACCESS_CODE_HASH|PLATFORM_ADMIN_CODE_HASH|NOTIFICATION_DISPATCH_SECRET|LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|SUPABASE_SERVICE_ROLE_KEY)=') {
      "$($Matches[1])=***"
    } else {
      $_
    }
  }
  Write-Host "supabase $($displayArguments -join ' ')" -ForegroundColor DarkGray
  & npx --yes supabase@latest @Arguments
  if ($LASTEXITCODE -ne 0) { throw "supabase $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Read-Secret {
  param([Parameter(Mandatory = $true)][string]$Prompt)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

Write-Host ''
Write-Host 'Smart Classroom — Supabase environment setup' -ForegroundColor Cyan
Write-Host "Project: $ProjectRef"
Write-Host ''

# 1. Link. The CLI asks for the database password of this project.
Write-Host 'Step 1/4  Linking the project (the CLI will ask for the database password)' -ForegroundColor Cyan
Invoke-Supabase @('link', '--project-ref', $ProjectRef)

if ($PushAuthConfig) {
  Write-Host 'Applying hosted Auth configuration (custom SMTP required for custom templates)' -ForegroundColor Cyan
  Invoke-Supabase @('config', 'push')
} else {
  Write-Host 'Auth config not pushed. Use -PushAuthConfig after custom SMTP is configured.' -ForegroundColor Yellow
}

# 2. Schema. Migrations are immutable and applied in filename order.
Write-Host 'Step 2/4  Applying migrations' -ForegroundColor Cyan
Invoke-Supabase @('db', 'push')

# 3. Edge Functions. line-notify is the only public webhook, so it verifies LINE's own signature
#    instead of a Supabase JWT.
Write-Host 'Step 3/4  Deploying Edge Functions' -ForegroundColor Cyan
foreach ($fn in @('sync-push', 'admin-access', 'member-invitation', 'account-onboarding', 'parent-link', 'first-school-setup')) {
  Invoke-Supabase @('functions', 'deploy', $fn)
}
Invoke-Supabase @('functions', 'deploy', 'platform-access')
if ($EnablePlatformDevSignIn) {
  Invoke-Supabase @('functions', 'deploy', 'platform-dev-access', '--no-verify-jwt')
}
Invoke-Supabase @('functions', 'deploy', 'line-notify', '--no-verify-jwt')
Invoke-Supabase @('functions', 'deploy', 'notification-dispatch', '--no-verify-jwt')
# A student has no account until this call succeeds, so it cannot require a Supabase JWT. Its own
# rate limiting, lockout and opaque failures are what stand in for one.
Invoke-Supabase @('functions', 'deploy', 'student-access', '--no-verify-jwt')
# Same reason for teachers and parents: signing in and signing up happen before there is a session,
# and the function checks the caller's own JWT for the actions that act on an existing account.
Invoke-Supabase @('functions', 'deploy', 'member-access', '--no-verify-jwt')

if ($SkipSecrets) {
  Write-Host 'Step 4/4  Skipped (-SkipSecrets)' -ForegroundColor Yellow
} else {
  Write-Host 'Step 4/4  Setting server secrets' -ForegroundColor Cyan
  Write-Host 'Press Enter on a generated secret to accept it. Nothing here is written to disk.' -ForegroundColor DarkGray

  $parentSecret = New-RandomSecret
  $memberSecret = New-RandomSecret
  $studentSecret = New-RandomSecret
  $memberAccessSecret = New-RandomSecret
  $notificationDispatchSecret = New-RandomSecret
  # Seals every product activation key. Without it a key can be drawn and never recovered, which is
  # the one failure the key is meant to prevent, so first-run refuses to issue one until it is set.
  $productKeySecret = New-RandomSecret

  $ownerCode = Read-Secret 'Owner access code (choose a long one; you will need it to create the first school)'
  if ([string]::IsNullOrWhiteSpace($ownerCode) -or $ownerCode.Length -lt 12) {
    throw 'Owner access code must be at least 12 characters.'
  }
  $platformCode = Read-Secret 'Platform operator code (choose a separate long one; you will need it at /platform)'
  if ([string]::IsNullOrWhiteSpace($platformCode) -or $platformCode.Length -lt 12) {
    throw 'Platform operator code must be at least 12 characters.'
  }
  # The Edge Functions trim pasted input before hashing, so setup must hash the same canonical value.
  $ownerCode = $ownerCode.Trim()
  $platformCode = $platformCode.Trim()
  # Only the hash reaches the server; the code itself never leaves this machine.
  $sha = [Security.Cryptography.SHA256]::Create()
  $ownerHash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($ownerCode)) | ForEach-Object { $_.ToString('x2') })
  $platformHash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($platformCode)) | ForEach-Object { $_.ToString('x2') })
  $sha.Dispose()

  $allowedOrigins = Read-Host 'Allowed origins (comma separated, e.g. https://your-app.example)'
  if ([string]::IsNullOrWhiteSpace($allowedOrigins)) { $allowedOrigins = 'http://localhost:5173' }

  Invoke-Supabase @('secrets', 'set', "PARENT_LINK_HMAC_SECRET=$parentSecret")
  Invoke-Supabase @('secrets', 'set', "MEMBER_INVITATION_HMAC_SECRET=$memberSecret")
  Invoke-Supabase @('secrets', 'set', "ADMIN_ACCESS_CODE_HASH=$ownerHash")
  Invoke-Supabase @('secrets', 'set', "PLATFORM_ADMIN_CODE_HASH=$platformHash")
  Invoke-Supabase @('secrets', 'set', "STUDENT_ACCESS_HMAC_SECRET=$studentSecret")
  Invoke-Supabase @('secrets', 'set', "MEMBER_ACCESS_HMAC_SECRET=$memberAccessSecret")
  Invoke-Supabase @('secrets', 'set', "NOTIFICATION_DISPATCH_SECRET=$notificationDispatchSecret")
  Invoke-Supabase @('secrets', 'set', "PRODUCT_KEY_SECRET=$productKeySecret")
  Invoke-Supabase @('secrets', 'set', "ALLOWED_ORIGINS=$allowedOrigins")
  if ($EnablePlatformDevSignIn) {
    Invoke-Supabase @('secrets', 'set', 'PLATFORM_DEV_SIGN_IN=true')
    if (-not [string]::IsNullOrWhiteSpace($PlatformDevOperator)) {
      Invoke-Supabase @('secrets', 'set', "PLATFORM_DEV_OPERATOR=$PlatformDevOperator")
    }
  }

  Write-Host ''
  Write-Host 'LINE credentials are optional. Set them when the LINE channel exists:' -ForegroundColor DarkGray
  Write-Host '  npx supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=... LINE_CHANNEL_SECRET=...' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host 'Next:' -ForegroundColor Cyan
Write-Host '  1. Put VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.local'
Write-Host '     (Dashboard - Project Settings - API. The anon key is browser-safe; the service role key is not.)'
Write-Host '  2. npm run dev, register your own account, then open /owner/access and create the first school'
Write-Host '     using the owner access code you just chose.'
Write-Host '  3. Open /platform, sign in with that account, and enter the separate platform operator code'
Write-Host '     to enrol the first platform operator.'
if ($EnablePlatformDevSignIn) {
  Write-Host '     Development one-field sign-in is enabled for this environment.' -ForegroundColor Yellow
}
Write-Host ''

$ownerCode = $null
$platformCode = $null
