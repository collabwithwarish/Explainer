# Installs Wariya as a panel in Premiere Pro (Window > Extensions > Wariya).
# The panel keeps its original ID (com.capitalstory.explainerstudio) so projects saved in it are kept.
# Run it again after changing the app to update the panel. Premiere can stay open: close the
# panel and open it again to load the new version (restart Premiere the first time).
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$app = Join-Path (Split-Path $here -Parent) 'Wariya.html'
$dest = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.capitalstory.explainerstudio'
if (-not (Test-Path $app)) { throw "Could not find the app at $app" }

# an older version of the panel (anything this installer did not put there) is kept, not deleted
if ((Test-Path $dest) -and -not (Test-Path (Join-Path $dest '.es3'))) {
  $backup = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ("Wariya\panel-backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force (Split-Path $backup -Parent) | Out-Null
  Move-Item $dest $backup
  Write-Host "Moved the previous panel to $backup"
}

New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($d in 'CSXS', 'jsx', 'icons') { Copy-Item (Join-Path $here $d) $dest -Recurse -Force }
Copy-Item $app (Join-Path $dest 'index.html') -Force
Set-Content (Join-Path $dest '.es3') 'Installed by premiere/install.ps1' -Encoding utf8

# Premiere only loads panels that are not signed through Adobe Exchange when this is on
foreach ($v in 11, 12, 13) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  if (-not (Test-Path $key)) { New-Item $key -Force | Out-Null }
  if ((Get-ItemProperty $key -ErrorAction SilentlyContinue).PlayerDebugMode -ne '1') {
    Set-ItemProperty $key -Name PlayerDebugMode -Value '1' -Type String
    Write-Host "Allowed unsigned panels for CSXS.$v"
  }
}

Write-Host "Installed Wariya into $dest"
Write-Host "In Premiere Pro: Window > Extensions > Wariya. If it was already open, close the panel and open it again."
