using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Per-launch fixups and starting the game through MO2 → SKSE.</summary>
public static partial class GameRunner
{
    /// <summary>True while Skyrim or its loader runs from this install (another Skyrim on the PC does not count).</summary>
    public static bool IsGameRunning(InstallState state) =>
        new[] { "SkyrimSE", "skse64_loader" }
            .SelectMany(Process.GetProcessesByName)
            .Any(p => RunsFrom(p, state.InstallRoot));

    private static bool RunsFrom(Process process, string root)
    {
        try
        {
            var path = process.MainModule?.FileName;
            return path is not null && path.StartsWith(root.TrimEnd('/', Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException) { return false; }
        finally { process.Dispose(); }
    }

    public static void Launch(InstallState state, Feed feed, Session session)
    {
        DisableProfileLocalSaves(state);
        DisableMo2GuiLock(state);
        PointMo2AtGame(state);
        WriteClientSettings(state, feed.Server, session);

        var psi = new ProcessStartInfo(state.Mo2Exe) { UseShellExecute = false, WorkingDirectory = state.ModlistDir };
        psi.ArgumentList.Add("-p");
        psi.ArgumentList.Add(LauncherConfig.Mo2Profile);
        psi.ArgumentList.Add($"moshortcut://:{LauncherConfig.Mo2ExecutableTitle}");
        var mo2 = Process.Start(psi);
        if (mo2 is not null) _ = HideMo2LockWindowAsync(mo2, state);
    }

    /// <summary>
    /// moshortcut:// makes MO2 wait with ForceWait, which shows its "locked" window even with
    /// lock_gui=false. MO2 must stay alive for the VFS, so its windows are hidden once the game runs.
    /// </summary>
    private static async Task HideMo2LockWindowAsync(Process mo2, InstallState state)
    {
        using (mo2)
        {
            while (!mo2.HasExited)
            {
                if (IsGameRunning(state))
                {
                    EnumWindows((hwnd, _) =>
                    {
                        GetWindowThreadProcessId(hwnd, out var pid);
                        if (pid == (uint)mo2.Id && IsWindowVisible(hwnd)) ShowWindow(hwnd, SwHide);
                        return true;
                    }, IntPtr.Zero);
                }
                await Task.Delay(500);
            }
        }
    }

    private const int SwHide = 0;
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int cmd);

    /// <summary>
    /// SkyrimPlatform writes its temporary save to My Games\...\Saves; with MO2 profile-local
    /// saves the game looks elsewhere and the player is stuck on the main menu.
    /// </summary>
    private static void DisableProfileLocalSaves(InstallState state)
    {
        var ini = Path.Combine(state.ModlistDir, "profiles", LauncherConfig.Mo2Profile, "settings.ini");
        if (!File.Exists(ini)) return;
        var text = File.ReadAllText(ini);
        var fixedText = LocalSaves().Replace(text, "LocalSaves=false");
        if (fixedText != text) File.WriteAllText(ini, fixedText);
    }

    /// <summary>
    /// Written into MO2's overwrite folder so it wins over the mod's copy and survives modlist updates.
    /// profileId must be unique per player: offline-mode SkyMP keys characters by it.
    /// </summary>
    private static void WriteClientSettings(InstallState state, FeedServer server, Session session)
    {
        var dir = Path.Combine(state.ModlistDir, "overwrite", "Platform", "Plugins");
        Directory.CreateDirectory(dir);
        var settings = new JsonObject
        {
            ["gameData"] = new JsonObject { ["profileId"] = session.SkympProfileId },
            ["master"] = "",
            ["server-ip"] = server.Host,
            ["server-port"] = server.Port,
            ["server-master-key"] = null,
        };
        File.WriteAllText(Path.Combine(dir, "skymp5-client-settings.txt"),
            settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    /// <summary>MO2 otherwise shows its "locked while the application is running" dialog on top of the game.</summary>
    private static void DisableMo2GuiLock(InstallState state)
    {
        var ini = Path.Combine(state.ModlistDir, "ModOrganizer.ini");
        if (!File.Exists(ini)) return;
        var text = File.ReadAllText(ini);
        var fixedText = LockGui().Replace(text, "lock_gui=false");
        if (fixedText != text) File.WriteAllText(ini, fixedText);
    }

    /// <summary>
    /// Wabbajack points MO2 at the player's Steam Skyrim; redirect every such path (gamePath,
    /// executables) to the launcher's own 1.6.1170 game folder.
    /// </summary>
    public static void PointMo2AtGame(InstallState state)
    {
        var ini = Path.Combine(state.ModlistDir, "ModOrganizer.ini");
        if (!File.Exists(ini)) return;
        var text = File.ReadAllText(ini);
        var current = GamePath().Match(text);
        if (!current.Success) return;
        var oldDir = current.Groups[1].Value.Replace(@"\\", @"\").TrimEnd('\\');
        var newDir = state.GameDir;
        if (string.Equals(oldDir, newDir, StringComparison.OrdinalIgnoreCase)) return;

        string Escaped(string p) => p.Replace(@"\", @"\\");
        string Forward(string p) => p.Replace('\\', '/');
        var fixedText = text
            .Replace(Escaped(oldDir), Escaped(newDir), StringComparison.OrdinalIgnoreCase)
            .Replace(Forward(oldDir), Forward(newDir), StringComparison.OrdinalIgnoreCase);
        File.WriteAllText(ini, fixedText);
    }

    // Wabbajack rewrites MO2 inis as "key = value", MO2 itself as "key=value".
    [GeneratedRegex(@"(?m)^gamePath *= *@ByteArray\((.*)\)\s*$")] private static partial Regex GamePath();
    [GeneratedRegex(@"(?m)^lock_gui *= *\w+")] private static partial Regex LockGui();
    [GeneratedRegex(@"(?m)^LocalSaves *= *\w+")] private static partial Regex LocalSaves();
}
