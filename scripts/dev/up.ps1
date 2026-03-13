$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$composeFile = Join-Path $repoRoot 'docker-compose.yml'
$dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$seedMarker = Join-Path $repoRoot '.docker\dynamodb\.seeded'
$backendLog = Join-Path $backendDir 'backend-dev.log'
$backendErrLog = Join-Path $backendDir 'backend-dev.err.log'
$frontendLog = Join-Path $frontendDir 'frontend-dev.log'
$frontendErrLog = Join-Path $frontendDir 'frontend-dev.err.log'

function Write-Step {
    param([string]$Message)
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor Cyan
}

function Test-DockerReady {
    try {
        docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-PortListening {
    param([int]$Port)

    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop).Count -gt 0
    } catch {
        return $false
    }
}

function Test-HttpOk {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [int]$TimeoutSeconds,
        [string]$FailureMessage
    )

    $watch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (& $Condition) {
            return
        }

        Start-Sleep -Seconds 2
    }

    throw $FailureMessage
}

Write-Step 'Subindo ambiente local do InvestAdmin'

if (-not (Test-Path $dockerDesktop)) {
    throw "Docker Desktop nao encontrado em $dockerDesktop"
}

if (-not (Test-DockerReady)) {
    Write-Step 'Abrindo Docker Desktop'
    Start-Process -FilePath $dockerDesktop | Out-Null
    Wait-Until -Condition { Test-DockerReady } -TimeoutSeconds 120 -FailureMessage 'Docker Desktop nao ficou pronto a tempo.'
}

Write-Step 'Garantindo DynamoDB Local'
docker compose -f $composeFile up -d | Out-Host
Wait-Until -Condition { Test-PortListening -Port 8000 } -TimeoutSeconds 30 -FailureMessage 'DynamoDB Local nao abriu a porta 8000.'

Write-Step 'Garantindo estrutura do banco local'
Push-Location $backendDir
try {
    & npm.cmd run db:setup | Out-Host

    if (-not (Test-Path $seedMarker)) {
        Write-Step 'Aplicando seed inicial do ambiente de dev'
        & npm.cmd run db:seed | Out-Host
        $seedMarkerDir = Split-Path -Parent $seedMarker
        if (-not (Test-Path $seedMarkerDir)) {
            New-Item -ItemType Directory -Path $seedMarkerDir -Force | Out-Null
        }
        New-Item -ItemType File -Path $seedMarker -Force | Out-Null
    }
} finally {
    Pop-Location
}

if (-not (Test-PortListening -Port 4000)) {
    Write-Step 'Iniciando backend local'
    if (Test-Path $backendLog) { Remove-Item $backendLog -Force }
    if (Test-Path $backendErrLog) { Remove-Item $backendErrLog -Force }

    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory $backendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError $backendErrLog | Out-Null
}

Wait-Until -Condition { Test-HttpOk -Url 'http://127.0.0.1:4000/api/indexes' } -TimeoutSeconds 60 -FailureMessage 'Backend local nao respondeu em /api/indexes.'

if (-not (Test-PortListening -Port 5173)) {
    Write-Step 'Iniciando frontend local'
    if (Test-Path $frontendLog) { Remove-Item $frontendLog -Force }
    if (Test-Path $frontendErrLog) { Remove-Item $frontendErrLog -Force }

    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev', '--', '--host', '127.0.0.1' `
        -WorkingDirectory $frontendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErrLog | Out-Null
}

Wait-Until -Condition { Test-HttpOk -Url 'http://127.0.0.1:5173' } -TimeoutSeconds 60 -FailureMessage 'Frontend local nao respondeu em http://127.0.0.1:5173.'

Write-Step 'Abrindo o app no navegador'
Start-Process 'http://127.0.0.1:5173' | Out-Null

Write-Step 'Ambiente pronto'
Write-Host 'Frontend: http://127.0.0.1:5173'
Write-Host 'Backend:  http://127.0.0.1:4000'
