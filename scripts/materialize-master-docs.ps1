param([Parameter(Mandatory=$true)][string]$SourcePath)
$ErrorActionPreference='Stop'
$repository=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$docs=Join-Path $repository 'docs'
$lines=Get-Content -LiteralPath $SourcePath -Encoding utf8
Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $docs '00_COMPLETE_ONE_SHOT_MASTER_BUILD_v5.0.md') -Force
$targets=@(
  @{marker='# EMBEDDED SOURCE 1:';file='README_EMBEDDED_SOURCE.md'},
  @{marker='# EMBEDDED SOURCE 2:';file='01_Smart_Classroom_Master_Spec_v3.1.md'},
  @{marker='# EMBEDDED SOURCE 3:';file='02_Architecture_Decisions.md'},
  @{marker='# EMBEDDED SOURCE 4:';file='03_Database_Specification.md'},
  @{marker='# EMBEDDED SOURCE 5:';file='04_RLS_Authorization_Matrix.md'},
  @{marker='# EMBEDDED SOURCE 6:';file='05_Local_IndexedDB_Specification.md'},
  @{marker='# EMBEDDED SOURCE 7:';file='06_Sync_Protocol_Specification.md'},
  @{marker='# EMBEDDED SOURCE 8:';file='07_Offline_Authentication_Policy.md'},
  @{marker='# EMBEDDED SOURCE 9:';file='08_Security_Specification.md'},
  @{marker='# EMBEDDED SOURCE 10:';file='09_API_Mutation_Boundary.md'},
  @{marker='# EMBEDDED SOURCE 11:';file='10_Implementation_Roadmap.md'},
  @{marker='# EMBEDDED SOURCE 12:';file='11_Acceptance_Test_Plan.md'},
  @{marker='# EMBEDDED SOURCE 13:';file='12_AI_Development_Controller.md'}
)
for($index=0;$index -lt $targets.Count;$index++){
  $markerIndex=-1
  for($lineIndex=0;$lineIndex -lt $lines.Count;$lineIndex++){if($lines[$lineIndex].StartsWith($targets[$index].marker)){$markerIndex=$lineIndex;break}}
  if($markerIndex -lt 0){throw "Marker not found: $($targets[$index].marker)"}
  $start=$markerIndex+1
  while($start -lt $lines.Count -and ($lines[$start] -eq '' -or $lines[$start].StartsWith('> **Source preservation note:'))){$start++}
  if($index -lt $targets.Count-1){
    $nextMarker=$targets[$index+1].marker;$end=-1
    for($lineIndex=$start;$lineIndex -lt $lines.Count;$lineIndex++){if($lines[$lineIndex].StartsWith($nextMarker)){$end=$lineIndex-2;break}}
  }else{
    $end=-1;for($lineIndex=$start;$lineIndex -lt $lines.Count;$lineIndex++){if($lines[$lineIndex] -eq '# E. EMBEDDED ONE-SHOT END-TO-END PRODUCTION BUILD MASTER PROMPT v4.0'){$end=$lineIndex-2;break}}
  }
  while($end -gt $start -and ($lines[$end] -eq '' -or $lines[$end] -eq '---')){$end--}
  [IO.File]::WriteAllLines((Join-Path $docs $targets[$index].file),$lines[$start..$end],(New-Object Text.UTF8Encoding($false)))
}
Write-Output "Materialized $($targets.Count) embedded documents plus the complete master file."
