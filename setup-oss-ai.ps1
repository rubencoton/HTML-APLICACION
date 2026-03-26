$ErrorActionPreference = "Stop"

$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen3:8b" }

function Test-Ollama {
  return [bool](Get-Command ollama -ErrorAction SilentlyContinue)
}

function Get-OllamaExe {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    "C:\Program Files\Ollama\ollama.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }

  return $null
}

if (-not (Test-Ollama)) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "No se encontro Ollama ni winget. Instala Ollama manualmente desde https://ollama.com/download/windows"
  }

  Write-Host "Instalando Ollama..." -ForegroundColor Yellow
  winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
}

$ollamaExe = Get-OllamaExe
if (-not $ollamaExe) {
  throw "Ollama parece instalado, pero no pude localizar ollama.exe. Reinicia PowerShell y vuelve a ejecutar el script."
}

Write-Host "Descargando modelo open source: $model" -ForegroundColor Cyan
& $ollamaExe pull $model

Write-Host "IA open source lista. Arranca la app con: node server.js" -ForegroundColor Green
