<#
.SYNOPSIS
  Creates the private owner's Supabase Auth identity for one environment.

.DESCRIPTION
  The owner account is an ordinary Supabase Auth user. What makes it privileged is the school
  membership the `admin-access` Edge Function grants after it checks the owner code — never the
  email address, and never anything written in this repository. This script only creates the
  identity so that the owner has something to sign in with; run it once per environment, then sign
  in and visit the unlinked /owner/access route to create the first school.

  Credentials are read as secure input or taken from environment variables, are sent straight to the
  Supabase Auth Admin API, and are never written to disk, echoed, or committed.

.PARAMETER ProjectUrl
  https://<project-ref>.supabase.co

.EXAMPLE
  $env:BOOTSTRAP_ADMIN_EMAIL = 'owner@example.com'
  ./scripts/bootstrap-admin.ps1 -ProjectUrl https://abcdefgh.supabase.co
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectUrl
)

$ErrorActionPreference = 'Stop'

function Read-SecureValue([string]$prompt, [string]$fromEnv) {
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) { return $fromEnv }
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$email = $env:BOOTSTRAP_ADMIN_EMAIL
if ([string]::IsNullOrWhiteSpace($email)) { $email = Read-Host 'Owner email' }
$password = Read-SecureValue 'Owner password (at least 12 characters)' $env:BOOTSTRAP_ADMIN_PASSWORD
$serviceKey = Read-SecureValue 'Supabase service role key (Project Settings > API)' $env:SUPABASE_SERVICE_ROLE_KEY

if ([string]::IsNullOrWhiteSpace($email) -or $email -notmatch '^[^@\s]+@[^@\s]+$') { throw 'A valid owner email is required.' }
if ($password.Length -lt 12) { throw 'Owner password must be at least 12 characters.' }
if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw 'The service role key is required to create the identity.' }

$body = @{
  email = $email
  password = $password
  email_confirm = $true
  user_metadata = @{ display_name = 'System Owner' }
} | ConvertTo-Json -Depth 4

Write-Host "Creating the owner identity in $ProjectUrl" -ForegroundColor Cyan
try {
  $response = Invoke-RestMethod -Method Post -Uri "$ProjectUrl/auth/v1/admin/users" -Body $body -ContentType 'application/json' -Headers @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
  }
  Write-Host "Created. User id: $($response.id)" -ForegroundColor Green
} catch {
  # A 422 means the identity already exists, which is the normal result of a second run.
  $status = $_.Exception.Response.StatusCode.value__
  if ($status -eq 422) { Write-Host 'That identity already exists; nothing to do.' -ForegroundColor Yellow }
  else { throw }
}

Write-Host ''
Write-Host 'Next: sign in with this account, then open /owner/access and enter the owner code you' -ForegroundColor DarkGray
Write-Host 'set as ADMIN_ACCESS_CODE_HASH during setup to create the first school.' -ForegroundColor DarkGray
Write-Host 'Change the password after the first sign-in.' -ForegroundColor DarkGray
