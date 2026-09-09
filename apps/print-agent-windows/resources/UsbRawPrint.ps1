# Sends raw ESC/POS bytes straight to a USB thermal printer that was never
# installed as a Windows printer at all -- no driver, no "Add a printer" step,
# nothing in Get-Printer. RawPrint.ps1 (winspool.drv) only ever reaches a
# printer Windows already knows about; this is for the ones it doesn't.
#
# JsPrinterDll.dll is a small vendor SDK (bundled under resources/, shipped by
# several thermal-printer resellers under different brand names -- Xprinter
# among them, the same brand this app's Bluetooth-name matching already
# recognises) that talks to the printer as a raw USB device by its own
# means, bypassing the Windows print spooler entirely. OpenUsb() takes no
# parameters -- it finds "the" USB thermal printer itself, so there's nothing
# for the user to configure here (no port, no VID/PID) the way there is for
# every other transport.
#
# The DLL is 32-bit only (built well before x64 was the default) -- the
# caller (printer-manager.js) is responsible for launching this specific
# script under the 32-bit PowerShell host (SysWOW64), or Add-Type's P/Invoke
# throws BadImageFormatException trying to load a 32-bit DLL into a 64-bit
# process.
param(
  [Parameter(Mandatory = $true)][string]$DllPath,
  [Parameter(Mandatory = $true)][string]$FilePath
)

if (-not (Test-Path -LiteralPath $DllPath)) {
  Write-Error "Bundled printer driver is missing: $DllPath"
  exit 1
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class UsbRawPrinter
{
    // HANDLE OpenUsb() -- no arguments; the SDK enumerates the USB printer itself.
    [DllImport(@"$DllPath", CallingConvention = CallingConvention.StdCall, SetLastError = true)]
    public static extern IntPtr OpenUsb();

    [DllImport(@"$DllPath", CallingConvention = CallingConvention.StdCall, SetLastError = true)]
    public static extern bool WriteUsb(IntPtr hUsb, byte[] SendBuf, uint SendBufSize, out uint BytesWritten);

    [DllImport(@"$DllPath", CallingConvention = CallingConvention.StdCall, SetLastError = true)]
    public static extern bool CloseUsb(IntPtr hUsb);

    public static bool SendBytes(byte[] bytes, out string error)
    {
        error = null;
        IntPtr hUsb = OpenUsb();
        // The SDK's own failure sentinel is INVALID_HANDLE_VALUE ((HANDLE)-1), not
        // null -- matches the vendor's own C++ example exactly.
        if (hUsb == IntPtr.Zero || hUsb == new IntPtr(-1))
        {
            error = "No USB printer found. Check it's plugged in, powered on, and not open in another app.";
            return false;
        }
        try
        {
            uint written;
            bool ok = WriteUsb(hUsb, bytes, (uint)bytes.Length, out written);
            if (!ok || written != (uint)bytes.Length)
            {
                error = string.Format("Only {0} of {1} bytes reached the printer -- check the cable and try again.", written, bytes.Length);
                return false;
            }
            return true;
        }
        finally
        {
            CloseUsb(hUsb);
        }
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$err = $null
$ok = [UsbRawPrinter]::SendBytes($bytes, [ref]$err)
if (-not $ok) {
  Write-Error $err
  exit 1
}
exit 0
