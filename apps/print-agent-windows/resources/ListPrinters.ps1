# Every printer Windows currently knows about -- the same underlying print-spooler
# data Chrome (and every other Windows app) reads from, just via PowerShell instead
# of Chrome's own native call. Get-Printer is the modern cmdlet; Win32_Printer (WMI)
# is the older, more universally-present fallback if PrintManagement isn't loaded
# for some reason.
#
# Previously this tried to get the default-printer flag with a per-printer
# Get-CimInstance call whose -Filter string hand-escaped backslashes in the printer
# name -- broken for any name with a quote in it, and a single throwing item inside
# a Select-Object calculated property can abort the whole pipeline with no output,
# which is exactly what "the printer list is just empty" looks like. Getting the
# default name once, separately, and comparing in plain string -eq avoids all of
# that -- no filter-string escaping of a printer name anywhere.

$ErrorActionPreference = 'Stop'

try {
  $printers = @(Get-Printer -ErrorAction Stop | Select-Object Name, PrinterStatus)
} catch {
  $printers = @(Get-CimInstance Win32_Printer -ErrorAction Stop | Select-Object Name, @{n = 'PrinterStatus'; e = { $_.Status } })
}

$defaultName = $null
try {
  $defaultName = Get-CimInstance Win32_Printer -ErrorAction Stop |
    Where-Object { $_.Default } | Select-Object -First 1 -ExpandProperty Name
} catch {
  # Default-printer flag is a nice-to-have; a WMI hiccup here shouldn't hide the
  # printer list itself.
}

$printers |
  ForEach-Object {
    [PSCustomObject]@{
      Name          = $_.Name
      PrinterStatus = [string]$_.PrinterStatus
      IsDefault     = ($defaultName -and $_.Name -eq $defaultName)
    }
  } |
  ConvertTo-Json -Compress
