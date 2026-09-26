using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Finds the player's Steam Skyrim Special Edition folder (app 489830).</summary>
public static partial class SteamLocator
{
    private const string AppId = "489830";

    public static string? FindSkyrimSE()
    {
        foreach (var library in SteamLibraries())
        {
            var manifest = Path.Combine(library, "steamapps", $"appmanifest_{AppId}.acf");
            if (!File.Exists(manifest)) continue;
            var installDir = InstallDir().Match(File.ReadAllText(manifest));
            if (!installDir.Success) continue;
            var dir = Path.Combine(library, "steamapps", "common", installDir.Groups[1].Value);
            if (File.Exists(Path.Combine(dir, "SkyrimSE.exe"))) return dir;
        }

        var registry = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Bethesda Softworks\Skyrim Special Edition", "Installed Path", null) as string;
        return registry is not null && File.Exists(Path.Combine(registry, "SkyrimSE.exe")) ? registry.TrimEnd('\\') : null;
    }

    private static IEnumerable<string> SteamLibraries()
    {
        var steam = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamPath", null) as string
                    ?? Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath", null) as string;
        if (steam is null) yield break;
        steam = steam.Replace('/', '\\');
        yield return steam;

        var vdf = Path.Combine(steam, "steamapps", "libraryfolders.vdf");
        if (!File.Exists(vdf)) yield break;
        foreach (Match m in LibraryPath().Matches(File.ReadAllText(vdf)))
            yield return m.Groups[1].Value.Replace(@"\\", @"\");
    }

    [GeneratedRegex("\"installdir\"\\s+\"([^\"]+)\"")] private static partial Regex InstallDir();
    [GeneratedRegex("\"path\"\\s+\"([^\"]+)\"")] private static partial Regex LibraryPath();
}
