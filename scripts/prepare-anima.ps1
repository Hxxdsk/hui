param([string]$Proxy = '')
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskData = [System.IO.Path]::GetFullPath((Join-Path $taskRoot 'data'))
$taskTarget = [System.IO.Path]::GetFullPath((Join-Path $taskData 'tags.sqlite'))
$taskPartial = [System.IO.Path]::GetFullPath((Join-Path $taskData 'tags.sqlite.download'))
if ((Split-Path -Parent $taskTarget) -ne $taskData -or (Split-Path -Parent $taskPartial) -ne $taskData) { throw 'Unexpected destination path' }
$taskUrl = 'https://raw.githubusercontent.com/laziji1201/anima-prompt-tool/c3c582e28f12ce89703a91ce7de083e461e6eec1/data/tags.sqlite'
if (!(Test-Path -LiteralPath $taskTarget)) {
    $taskCurlArguments = @('--fail','--location','--silent','--show-error','--connect-timeout','10','--max-time','180','--output',$taskPartial)
    if ($Proxy) { $taskCurlArguments += @('--proxy',$Proxy) }
    $taskCurlArguments += $taskUrl
    & curl.exe @taskCurlArguments
    if ($LASTEXITCODE -ne 0) { throw 'Download failed. Check connectivity or supply -Proxy http://127.0.0.1:<port>. Global Git settings are not modified.' }
    & python (Join-Path $PSScriptRoot 'verify-anima-db.py') $taskPartial
    if ($LASTEXITCODE -ne 0) { throw 'Downloaded database verification failed; existing files were preserved.' }
    Move-Item -LiteralPath $taskPartial -Destination $taskTarget
}
& python (Join-Path $PSScriptRoot 'verify-anima-db.py') $taskTarget
if ($LASTEXITCODE -ne 0) { throw 'Database verification failed; existing files were preserved.' }
& python (Join-Path $PSScriptRoot 'build-anima-index.py')
if ($LASTEXITCODE -ne 0) { throw 'Index build failed.' }
