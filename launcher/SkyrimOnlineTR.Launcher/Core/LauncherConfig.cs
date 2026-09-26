namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>
/// Fixed endpoints. Everything that changes per release lives in the feed, not here.
/// SOTR_FEED_URL and SOTR_HOME override the feed and the per-user data folder for testing.
/// </summary>
public static class LauncherConfig
{
    public static readonly string FeedUrl =
        Environment.GetEnvironmentVariable("SOTR_FEED_URL") ?? "https://87-76-146-253.sslip.io/skyrim-online-tr/feed.json";
    public const string AuthBaseUrl = "https://87-76-146-253.sslip.io/auth";
    public const string DefaultInstallRoot = @"C:\Games\SkyrimOnlineTR";

    /// <summary>MO2 executable title that starts the game through SKSE.</summary>
    public const string Mo2ExecutableTitle = "SKSE";
    public const string Mo2Profile = "Default";

    public static string AppDataDir
    {
        get
        {
            var dir = Environment.GetEnvironmentVariable("SOTR_HOME")
                      ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyrimOnlineTR");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static Version CurrentVersion =>
        typeof(LauncherConfig).Assembly.GetName().Version ?? new Version(0, 0, 0);
}
