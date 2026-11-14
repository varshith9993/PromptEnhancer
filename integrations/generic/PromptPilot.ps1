# Source this file in your PowerShell profile ($PROFILE):
#   . "C:\path\to\PromptEnhancer\integrations\generic\PromptPilot.ps1"

$script:PromptPilotRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function enhance {
  param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$PromptArgs,
    [string]$Mode = "",
    [string]$Provider = "",
    [string]$UserSelectedProfile = "",
    [string]$Agent = "generic"
  )

  $promptText = $PromptArgs -join " "
  $cli = Join-Path $script:PromptPilotRoot "apps\cli\dist\index.js"

  $argsList = @()
  if (Test-Path $cli) {
    $cmd = "node"
    $argsList += @($cli, "enhance", $promptText)
  } else {
    $cmd = "npx"
    $argsList += @("--yes", "@promptpilot/cli", "enhance", $promptText)
  }

  if ($Mode) { $argsList += @("--mode", $Mode) }
  if ($Provider) { $argsList += @("--provider", $Provider) }
  if ($UserSelectedProfile) { $argsList += @("--profile", $UserSelectedProfile) }
  if ($Agent) { $argsList += @("--agent", $Agent) }

  $output = & $cmd @argsList
  if ($LASTEXITCODE -eq 0) {
    $text = $output -join "`n"
    try { $text | Set-Clipboard } catch { }
    Write-Output $text
    Write-Host "`n[PromptPilot] Copied enhanced prompt to clipboard." -ForegroundColor Green
  }
}

function /enhance {
  enhance @args
}


