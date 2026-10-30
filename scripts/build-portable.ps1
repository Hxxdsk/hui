$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot 'release'
$packageRoot = Join-Path $releaseRoot '绘-便携版'
New-Item -ItemType Directory -Force -Path $packageRoot, (Join-Path $packageRoot 'runtime'), (Join-Path $packageRoot 'app') | Out-Null
$appRoot = Join-Path $packageRoot 'app'
function Copy-DevelopmentRuntime($source, $destination) {
    try { Copy-Item -LiteralPath $source -Destination $destination -Force }
    catch {
        $lockCode = $_.Exception.HResult -band 0xFFFF
        if ($lockCode -notin @(32,33)) { throw }
        Write-Warning 'The development launcher is running; keeping its current file. The release package uses the newly built runtime.'
    }
}
foreach ($name in @('server.mjs','desktop-lifecycle.mjs','update-manager.mjs','update-worker.mjs','update-engine.mjs','updates.mjs','preferences.mjs','translation.mjs','anima-service.mjs','anima-image.mjs','anima-download.mjs','anima-bridge.py','install-vc-runtime.ps1','package.json','package-lock.json','public','data','node_modules')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $appRoot -Recurse -Force }
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $packageRoot 'runtime\node.exe') -Force
$nodeLicense = Join-Path (Split-Path (Get-Command node.exe).Source) 'LICENSE'
if (Test-Path -LiteralPath $nodeLicense) { Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $packageRoot 'runtime\LICENSE') -Force }
if (!(Test-Path -LiteralPath $nodeLicense)) { Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime\LICENSE') -Destination (Join-Path $packageRoot 'runtime\LICENSE') -Force }
Copy-Item -LiteralPath (Join-Path $projectRoot 'vendor\anima-prompt-tool\LICENSE') -Destination (Join-Path $appRoot 'data\LICENSE-anima-prompt-tool.txt') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot '使用教程.txt') -Destination $packageRoot -Force
$skillSource = Join-Path $projectRoot 'vendor\anima-tagger'
$skillTarget = Join-Path $appRoot 'vendor\anima-tagger'
foreach ($file in Get-ChildItem -LiteralPath $skillSource -Recurse -File -Force) {
    $relative = $file.FullName.Substring($skillSource.Length).TrimStart('\')
    if ($relative -match '(^|\\)(onnxruntime(?:-[^\\]+\.dist-info)?|numpy(?:\.libs|-[^\\]+\.dist-info)?|PIL|pillow(?:\.libs|-[^\\]+\.dist-info)?|\.hui-image-python|\.hui-image\.json(?:\.tmp)?|\.install-cache|\.pip-cache|\.hf-cache|\.work|__pycache__|pixai-tagger-v1\.0-onnx|pixai-tagger-v1\.0-original|Scripts)(\\|$)' -or $file.Extension -eq '.pyc') { continue }
    $destination = Join-Path $skillTarget $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$assets = Join-Path $projectRoot 'assets'
$buildTools = Join-Path $releaseRoot '.build-tools'
New-Item -ItemType Directory -Force -Path $assets,$buildTools | Out-Null
& $compiler /nologo /target:exe /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"$buildTools\IconBuilder.exe" "$PSScriptRoot\HuiMark.cs" "$PSScriptRoot\IconBuilder.cs"
if ($LASTEXITCODE -ne 0) { throw 'Icon build failed' }
& "$buildTools\IconBuilder.exe" "$assets\hui.ico" "$assets\brand.png"
Copy-Item -LiteralPath $assets -Destination $packageRoot -Recurse -Force
& $compiler /nologo /codepage:65001 /target:winexe /win32icon:"$assets\hui.ico" /platform:anycpu /win32manifest:"$PSScriptRoot\HuiLauncher.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"$packageRoot\绘.exe" "$PSScriptRoot\HuiLauncher.cs" "$PSScriptRoot\HuiMark.cs" "$PSScriptRoot\HuiDesktop.cs"
if ($LASTEXITCODE -ne 0) { throw 'EXE 编译失败' }
Copy-DevelopmentRuntime (Join-Path $packageRoot '绘.exe') (Join-Path $projectRoot '绘.exe')
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'runtime') | Out-Null
Copy-DevelopmentRuntime (Get-Command node.exe).Source (Join-Path $projectRoot 'runtime\node.exe')

& $compiler /nologo /codepage:65001 /target:winexe /win32icon:"$assets\hui.ico" /platform:anycpu /win32manifest:"$PSScriptRoot\HuiLauncher.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"$buildTools\hui-update.exe" "$PSScriptRoot\HuiUpdater.cs"
if ($LASTEXITCODE -ne 0) { throw 'Updater build failed' }
foreach ($name in @('README.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md','docs')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $packageRoot -Recurse -Force }
& node (Join-Path $PSScriptRoot 'build-releases.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed' }
