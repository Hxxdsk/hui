param([Parameter(Mandatory=$true)][string]$Installer,[switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -FilePath $Installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)CN=Microsoft Corporation(,|$)') { throw 'Microsoft installer signature verification failed.' }
if ($CheckOnly) { Write-Output 'Microsoft signature verified.'; exit 0 }
Write-Output 'Waiting for Windows authorization to install the Microsoft C++ runtime...'
try {
    $process = Start-Process -FilePath $Installer -ArgumentList '/install','/passive','/norestart' -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -notin @(0,3010,1638)) { throw "Microsoft runtime installer returned $($process.ExitCode)." }
    if ($process.ExitCode -eq 3010) { Write-Output 'Restart Windows to finish installation.' }
    Write-Output 'Microsoft C++ runtime installation completed.'
} catch { throw "Installation was cancelled or failed: $($_.Exception.Message)" }
