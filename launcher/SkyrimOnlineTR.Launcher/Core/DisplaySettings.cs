using System.Text.RegularExpressions;

namespace SkyrimOnlineTR.Launcher.Core;

public enum WindowMode { Fullscreen, Borderless, Windowed }

/// <summary>
/// Window mode and resolution, stored in the MO2 profile's SkyrimPrefs.ini ([Display] section)
/// so they apply only to this install.
/// </summary>
public sealed partial class DisplaySettings(InstallState state)
{
    private string IniPath => Path.Combine(state.ModlistDir, "profiles", LauncherConfig.Mo2Profile, "skyrimprefs.ini");

    public bool Available => File.Exists(IniPath);

    public (WindowMode mode, int width, int height) Read()
    {
        var text = File.ReadAllText(IniPath);
        var fullscreen = Get(text, "bFull Screen") == "1";
        var borderless = Get(text, "bBorderless") == "1";
        var mode = fullscreen ? WindowMode.Fullscreen : borderless ? WindowMode.Borderless : WindowMode.Windowed;
        int.TryParse(Get(text, "iSize W"), out var w);
        int.TryParse(Get(text, "iSize H"), out var h);
        return (mode, w, h);
    }

    public void Write(WindowMode mode, int width, int height)
    {
        var text = File.ReadAllText(IniPath);
        text = Set(text, "bFull Screen", mode == WindowMode.Fullscreen ? "1" : "0");
        text = Set(text, "bBorderless", mode == WindowMode.Borderless ? "1" : "0");
        text = Set(text, "iSize W", width.ToString());
        text = Set(text, "iSize H", height.ToString());
        File.WriteAllText(IniPath, text);
    }

    private static string? Get(string text, string key)
    {
        var m = Regex.Match(text, $@"(?mi)^{Regex.Escape(key)} *= *(\S*)");
        return m.Success ? m.Groups[1].Value : null;
    }

    /// <summary>Replaces the key where it is, or adds it under [Display].</summary>
    private static string Set(string text, string key, string value)
    {
        var line = new Regex($@"(?mi)^{Regex.Escape(key)} *=.*$");
        if (line.IsMatch(text)) return line.Replace(text, $"{key}={value}", 1);
        var section = DisplaySection();
        return section.IsMatch(text)
            ? section.Replace(text, m => $"{m.Value}\r\n{key}={value}", 1)
            : text + $"\r\n[Display]\r\n{key}={value}\r\n";
    }

    [GeneratedRegex(@"(?mi)^\[Display\][^\r\n]*")] private static partial Regex DisplaySection();
}
