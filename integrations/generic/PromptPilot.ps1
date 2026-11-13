# Source this file in your PowerShell profile ($PROFILE):
#   . "C:\path\to\PromptEnhancer\integrations\generic\PromptPilot.ps1"

$script:PromptPilotRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function enhance {
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Prompt,
    [string]$Mode = "free",
    [string]$Provider = "aihorde",
    [string]$UserSelectedProfile = ""
  )

  $cli = Join-Path $script:PromptPilotRoot "apps\cli\dist\index.js"
  $argsList = @($cli, "enhance", $Prompt, "--mode", $Mode, "--provider", $Provider)
  if ($UserSelectedProfile) { $argsList += @("--profile", $UserSelectedProfile) }

  $output = & node @argsList
  if ($LASTEXITCODE -eq 0) {
    $text = $output -join "`n"
    $text | Set-Clipboard
    Write-Output $text
    Write-Host "`n[PromptPilot] Copied enhanced prompt to clipboard." -ForegroundColor Green
  }
}

