$ErrorActionPreference = 'Stop'
$config = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$productName = $config.productName
$version = $config.version
$identifier = $config.identifier
$publisher = if ($env:MSIX_PUBLISHER) { $env:MSIX_PUBLISHER } else { "CN=$productName" }
$releaseDir = Resolve-Path 'src-tauri/target/x86_64-pc-windows-msvc/release'
$outDir = "$releaseDir/bundle/msix"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$staging = Join-Path $env:RUNNER_TEMP 'msix-staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path "$staging/Assets" | Out-Null
Copy-Item "$releaseDir/$productName.exe" $staging
Get-ChildItem $releaseDir -Filter *.dll | Copy-Item -Destination $staging

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile((Resolve-Path 'src-tauri/icons/128x128.png'))
$sizes = @{ 'Square44x44Logo.png' = 44; 'Square50x50Logo.png' = 50; 'StoreLogo.png' = 50; 'Square150x150Logo.png' = 150; 'Square300x300Logo.png' = 300 }
foreach ($entry in $sizes.GetEnumerator()) {
  $bitmap = New-Object System.Drawing.Bitmap $entry.Value, $entry.Value
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($source, 0, 0, $entry.Value, $entry.Value)
  $bitmap.Save("$staging/Assets/$($entry.Key)", [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}
$source.Dispose()

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="$identifier" Publisher="$publisher" Version="$version.0" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>$productName</DisplayName>
    <PublisherDisplayName>$productName</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>$productName</Description>
  </Properties>
  <Resources>
    <Resource Language="en-US"/>
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0"/>
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
  <Applications>
    <Application Id="$productName" Executable="$productName.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$productName" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" Description="$productName" BackgroundColor="transparent"/>
    </Application>
  </Applications>
</Package>
"@
$manifest | Out-File -FilePath "$staging/AppxManifest.xml" -Encoding utf8

$kit = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } | Sort-Object Name -Descending | Select-Object -First 1
$makeAppx = "$($kit.FullName)\x64\MakeAppx.exe"
$signtool = "$($kit.FullName)\x64\signtool.exe"
if (-not (Test-Path $makeAppx)) {
  $makeAppx = (Get-Command MakeAppx.exe -ErrorAction Stop).Source
  $signtool = (Get-Command signtool.exe -ErrorAction Stop).Source
}
$msixPath = "$outDir/$productName`_$version`_x64.msix"
& $makeAppx pack /d $staging /p $msixPath /o
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx failed' }

if ($env:MSIX_PFX_BASE64) {
  $pfxPath = Join-Path $env:RUNNER_TEMP 'signing.pfx'
  [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($env:MSIX_PFX_BASE64))
  & $signtool sign /fd SHA256 /f $pfxPath /p $env:MSIX_PFX_PASSWORD $msixPath
} else {
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=$productName" -CertStoreLocation 'Cert:\CurrentUser\My' -KeyExportPolicy Exportable
  $pfxPath = Join-Path $env:RUNNER_TEMP 'selfsigned.pfx'
  $password = [Guid]::NewGuid().ToString()
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
  & $signtool sign /fd SHA256 /f $pfxPath /p $password $msixPath
}
if ($LASTEXITCODE -ne 0) { throw 'signtool failed' }

Write-Output "MSIX built: $msixPath"