namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Fixed endpoints. Everything that changes per release lives in the feed, not here.</summary>
public static class LauncherConfig
{
    public const string FeedUrl = "https://87-76-146-253.sslip.io/skyrim-online-tr/feed.json";
    public const string AuthBaseUrl = "https://87-76-146-253.sslip.io/auth";
    public const string DefaultInstallRoot = @"C:\Games\SkyrimOnlineTR";

    /// <summary>MO2 executable title that starts the game through SKSE.</summary>
    public const string Mo2ExecutableTitle = "SKSE";
    public const string Mo2Profile = "Default";

    public static string AppDataDir
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyrimOnlineTR");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static Version CurrentVersion =>
        typeof(LauncherConfig).Assembly.GetName().Version ?? new Version(0, 0, 0);
}
