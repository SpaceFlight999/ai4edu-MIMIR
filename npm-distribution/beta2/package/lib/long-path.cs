using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

// Use extended Win32 paths so Windows PowerShell's legacy .NET path switches
// and the machine-wide LongPathsEnabled policy do not affect extraction.
public static class MimirLongPath {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateDirectoryW(string path, IntPtr security);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFileAttributesW(string path);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
        IntPtr security, uint disposition, uint attributes, IntPtr template);

    private static string Extended(string path) {
        if (path.StartsWith(@"\\?\", StringComparison.Ordinal)) return path;
        if (path.StartsWith(@"\\", StringComparison.Ordinal)) return @"\\?\UNC\" + path.Substring(2);
        if (path.Length < 3 || path[1] != ':' || path[2] != '\\') throw new IOException("Expected an absolute Windows path.");
        return @"\\?\" + path;
    }

    public static void EnsureDirectory(string path) {
        string extended = Extended(path);
        uint attributes = GetFileAttributesW(extended);
        if (attributes != UInt32.MaxValue) {
            if ((attributes & 16) == 0 || (attributes & 1024) != 0)
                throw new IOException("Extraction directory is not a regular directory: " + path);
            return;
        }
        int error = Marshal.GetLastWin32Error();
        if (error != 2 && error != 3) throw new Win32Exception(error, path);
        int split = path.LastIndexOf('\\');
        if (split > 2) EnsureDirectory(path.Substring(0, split));
        if (!CreateDirectoryW(extended, IntPtr.Zero)) {
            error = Marshal.GetLastWin32Error();
            if (error != 183) throw new Win32Exception(error, path);
            attributes = GetFileAttributesW(extended);
            if (attributes == UInt32.MaxValue || (attributes & 16) == 0 || (attributes & 1024) != 0)
                throw new IOException("Extraction directory was replaced: " + path);
        }
    }

    public static FileStream Open(string path, bool write) {
        SafeFileHandle handle = CreateFileW(Extended(path), write ? 0x40000000U : 0x80000000U,
            write ? 0U : 1U, IntPtr.Zero, write ? 1U : 3U, 128U, IntPtr.Zero);
        if (handle.IsInvalid) {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, path);
        }
        try { return new FileStream(handle, write ? FileAccess.Write : FileAccess.Read); }
        catch { handle.Dispose(); throw; }
    }
}
