# Bluetooth thermal printers almost never announce themselves as a proper
# Windows "printer" the way USB ones do. What actually happens on pairing is
# Windows creates a "Standard Serial over Bluetooth link" COM port for the
# device's SPP (Serial Port Profile) -- the same profile this project's
# Android print-bridge app talks over. Getting from "paired" to "usable
# printer" normally means a manual trip through Add a Printer -> "isn't
# listed" -> pick the COM port -> pick the Generic/Text Only driver. That
# second step is what this script automates; the pairing itself is a Windows
# security boundary no app (this one included) can click through on the
# user's behalf.
#
# -Action Detect  : lists Bluetooth serial COM ports not already bound to an
#                    installed printer -- i.e. paired, but not set up yet.
# -Action Install  : binds one such port to a new generic/raw printer. Needs
#                     admin rights (Add-Printer always does); self-elevates
#                     via a UAC prompt if not already running elevated.
param(
  [Parameter(Mandatory = $true)][ValidateSet('Detect', 'Install')][string]$Action,
  [string]$PortName,
  [string]$PrinterName
)

function Get-BluetoothSerialCandidates {
  # @(...) forces array context -- Select-Object -ExpandProperty returns a bare
  # scalar (not a 1-element array) when exactly one printer is installed, which
  # would make -notcontains below compare against a single string instead of a
  # list.
  $installedPorts = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PortName)
  Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Ports'" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'Bluetooth' -and $_.Name -match '\((COM\d+)\)' } |
    ForEach-Object {
      # Re-match rather than trust $Matches from the Where-Object filter above --
      # explicit is safer than relying on operator evaluation order to have left
      # it populated correctly.
      $null = $_.Name -match '\((COM\d+)\)'
      $port = $Matches[1]
      if ($installedPorts -notcontains $port) {
        [PSCustomObject]@{ Port = $port; Name = $_.Name }
      }
    }
}

if ($Action -eq 'Detect') {
  $candidates = Get-BluetoothSerialCandidates
  $candidates | Select-Object Port, Name | ConvertTo-Json -Compress
  exit 0
}

# --- Install ---
if (-not $PortName -or -not $PrinterName) {
  Write-Error 'Install requires -PortName and -PrinterName'
  exit 1
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
  # Re-launch this exact script elevated. Windows shows the UAC prompt here --
  # there is no silent way around that for a machine-wide printer install,
  # by design.
  $escapedPort = $PortName -replace '"', '""'
  $escapedName = $PrinterName -replace '"', '""'
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Action', 'Install', '-PortName', "`"$escapedPort`"", '-PrinterName', "`"$escapedName`"")
  try {
    $proc = Start-Process powershell -Verb RunAs -ArgumentList $argList -Wait -PassThru
    exit $proc.ExitCode
  } catch {
    Write-Error "Admin permission was not granted, so the printer could not be installed: $_"
    exit 1
  }
}

if (-not (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $PortName
}
# "Generic / Text Only" is the built-in Windows driver that passes raw bytes
# through untouched -- exactly what ESC/POS needs, same as the USB path.
Add-Printer -Name $PrinterName -DriverName 'Generic / Text Only' -PortName $PortName
exit 0
