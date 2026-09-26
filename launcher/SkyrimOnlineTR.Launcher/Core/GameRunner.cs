using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Per-launch fixups and starting the game through MO2 → SKSE.</summary>
public static partial class GameRunner
{
    public static bool IsGameRunning() =>
        Process.GetProcessesByName("SkyrimSE").Length > 0 || Process.GetProcessesByName("skse64_loader").Length > 0;

    public static void Launch(InstallState state, Feed feed, Session session)
    {
        DisableProfileLocalSaves(state);
        WriteClientSettings(state, feed.Server, session);

        var psi = new ProcessStartInfo(state.Mo2Exe) { UseShellExecute = false, WorkingDirectory = state.ModlistDir };
        psi.ArgumentList.Add("-p");
        psi.ArgumentList.Add(LauncherConfig.Mo2Profile);
        psi.ArgumentList.Add($"moshortcut://:{LauncherConfig.Mo2ExecutableTitle}");
        Process.Start(psi);
    }

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

    [GeneratedRegex(@"(?m)^LocalSaves=\w+")] private static partial Regex LocalSaves();
}
