using System.Diagnostics;
using System.Net.Http;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>
/// Replaces the running exe with the feed's launcher build and restarts.
/// Windows lets a running exe be renamed but not overwritten, so the old one is moved aside
/// and deleted on the next start.
/// </summary>
public static class SelfUpdater
{
    private static string ExePath => Environment.ProcessPath ?? throw new InvalidOperationException("Exe yolu bulunamadı.");
    private static string OldPath => ExePath + ".old";

    public static void CleanupPreviousVersion()
    {
        try { if (File.Exists(OldPath)) File.Delete(OldPath); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }

    public static bool IsNewer(FeedFile launcher) =>
        Version.TryParse(launcher.Version, out var remote) && remote > LauncherConfig.CurrentVersion;

    public static async Task UpdateAndRestartAsync(HttpClient http, FeedFile launcher,
        IProgress<(long done, long total)> progress, CancellationToken ct)
    {
        var staged = Path.Combine(LauncherConfig.AppDataDir, $"SkyrimOnlineTR-{launcher.Version}.exe");
        await Downloader.DownloadVerifiedAsync(http, launcher, staged, progress, ct);

        if (File.Exists(OldPath)) File.Delete(OldPath);
        File.Move(ExePath, OldPath);
        try
        {
            File.Copy(staged, ExePath, overwrite: true);
        }
        catch
        {
            File.Move(OldPath, ExePath); // put the working exe back
            throw;
        }

        Process.Start(new ProcessStartInfo(ExePath) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(ExePath)! });
        Environment.Exit(0);
    }
}
