<#
.SYNOPSIS
  Produces an access code and the SHA-256 hash the server stores for it.

.DESCRIPTION
  Two entrances in this system are guarded by a code the server knows only as a hash:
  ADMIN_ACCESS_CODE_HASH, which turns a signed-in account into the owner of the first school, and
  PLATFORM_ADMIN_CODE_HASH, which enrols the first platform operator. Neither the code nor anything
  derived from it is stored in this repository.

  Only the hash goes into the deployment. The code itself goes to a password manager and nowhere
  else: a hash cannot be turned back into a code, so a leaked environment file does not hand anybody
  an entrance, and losing the code means generating a new pair rather than recovering the old one.

  By default the code is generated here, from the platform's cryptographic random source, because a
  code somebody invents is a code somebody can guess. Pass -FromExistingCode to hash one you already
  have instead; it is read as secure input and never echoed.

.PARAMETER Purpose
  Which variable this code is for. Only affects the line printed at the end.

.PARAMETER FromExistingCode
  Hash a code you already hold rather than generating a new one.

.EXAMPLE
  ./scripts/new-access-code.ps1 -Purpose PLATFORM_ADMIN_CODE_HASH

.EXAMPLE
  ./scripts/new-access-code.ps1 -Purpose ADMIN_ACCESS_CODE_HASH -FromExistingCode
#>
[CmdletBinding()]
param(
  [ValidateSet('PLATFORM_ADMIN_CODE_HASH', 'ADMIN_ACCESS_CODE_HASH')]
  [string]$Purpose = 'PLATFORM_ADMIN_CODE_HASH',
  [switch]$FromExistingCode
)

$ErrorActionPreference = 'Stop'

function New-AccessCode {
  # 32 characters from a 32-symbol alphabet is 160 bits. The alphabet leaves out the pairs people
  # mistype when reading a code aloud or off a screen: no O or 0, no I, l or 1.
  $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.ToCharArray()
  $bytes = New-Object byte[] 32
  # RNGCryptoServiceProvider rather than the newer RandomNumberGenerator.Fill, which Windows
  # PowerShell 5.1 — the shell this repository is developed on — does not have.
  $random = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  try { $random.GetBytes($bytes) } finally { $random.Dispose() }
  $characters = foreach ($byte in $bytes) { $alphabet[$byte % $alphabet.Length] }
  # Grouped for reading aloud; the groups are cosmetic and the whole string is the code.
  (-join $characters) -replace '(.{8})(?!$)', '$1-'
}

function Get-Sha256Hex([string]$value) {
  # UTF-8 bytes of exactly the characters typed, with no trailing newline: the Edge Function hashes
  # the trimmed string it receives, so anything extra here produces a hash that never matches.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($value))
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

if ($FromExistingCode) {
  $secure = Read-Host -Prompt 'Access code' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $code = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $code = $code.Trim()
  if ($code.Length -lt 12) { throw 'An access code must be at least 12 characters.' }
  $generated = $false
} else {
  $code = New-AccessCode
  $generated = $true
}

$hash = Get-Sha256Hex $code

Write-Host ''
if ($generated) {
  Write-Host 'Access code - copy this into a password manager now. It is not stored anywhere and' -ForegroundColor Yellow
  Write-Host 'cannot be recovered from the hash below.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host "  $code" -ForegroundColor Cyan
  Write-Host ''
}
Write-Host 'Set this on the server (Supabase project secrets, not a committed file):' -ForegroundColor Green
Write-Host ''
Write-Host "  $Purpose=$hash"
Write-Host ''
Write-Host 'Then:' -ForegroundColor DarkGray
Write-Host '  supabase secrets set ' -NoNewline -ForegroundColor DarkGray
Write-Host "$Purpose=$hash" -ForegroundColor DarkGray

if ($Purpose -eq 'PLATFORM_ADMIN_CODE_HASH') {
  Write-Host ''
  Write-Host 'Next: sign in to /platform with your own account, then enter the code once to enrol as' -ForegroundColor DarkGray
  Write-Host 'the first operator. Later operators are granted from inside the console instead.' -ForegroundColor DarkGray
}

# The code stays only in this console's scrollback. Clear it when you are done.
$code = $null
