using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http;
using System.Text.RegularExpressions;

namespace SkyrimOnlineTR.Launcher.Core;

public sealed record InstallProgress(string Phase, double? Fraction, string? Detail);

/// <summary>
/// Installs or updates the modlist with wabbajack-cli. All archives in the modlist use direct
/// URLs (GitHub releases), so no Nexus account is needed. The modlist carries no game files:
/// the game folder is built separately by <see cref="Downgrader"/>.
/// </summary>
public sealed partial class GameInstaller(HttpClient http, InstallState state)
{
    public bool NeedsUpdate(Feed feed) =>
        !state.IsInstalled || state.ModlistVersion != feed.Modlist.Version || !File.Exists(Path.Combine(state.GameDir, "SkyrimSE.exe"));

    public async Task InstallAsync(Feed feed, IProgress<InstallProgress> progress, CancellationToken ct)
    {
        Directory.CreateDirectory(state.InstallRoot);
        await EnsureWabbajackAsync(feed.Wabbajack, progress, ct);

        var wabbajackFile = Path.Combine(state.InstallRoot, $"SkyrimOnlineTR-{feed.Modlist.Version}.wabbajack");
        await Downloader.DownloadVerifiedAsync(http, feed.Modlist, wabbajackFile,
            new Progress<(long done, long total)>(p => progress.Report(new("Modlist indiriliyor", Fraction(p), Mb(p)))), ct);

        await RunWabbajackAsync(wabbajackFile, progress, ct);
        await new Downgrader(http, state).ApplyAsync(feed.Downgrade, progress, ct);
        GameRunner.PointMo2AtGame(state);

        state.ModlistVersion = feed.Modlist.Version;
        state.Save();

        foreach (var old in Directory.EnumerateFiles(state.InstallRoot, "SkyrimOnlineTR-*.wabbajack"))
            if (!string.Equals(old, wabbajackFile, StringComparison.OrdinalIgnoreCase)) TryDelete(old);
    }

    private async Task EnsureWabbajackAsync(FeedFile wabbajack, IProgress<InstallProgress> progress, CancellationToken ct)
    {
        if (state.WabbajackVersion == wabbajack.Version && File.Exists(CliPath())) return;

        var zip = Path.Combine(state.InstallRoot, "Tools", $"wabbajack-{wabbajack.Version}.zip");
        await Downloader.DownloadVerifiedAsync(http, wabbajack, zip,
            new Progress<(long done, long total)>(p => progress.Report(new("Kurulum aracı indiriliyor", Fraction(p), Mb(p)))), ct);

        progress.Report(new("Kurulum aracı hazırlanıyor", null, null));
        if (Directory.Exists(state.WabbajackDir)) Directory.Delete(state.WabbajackDir, recursive: true);
        await Task.Run(() => ZipFile.ExtractToDirectory(zip, state.WabbajackDir), ct);
        TryDelete(zip);

        if (!File.Exists(CliPath())) throw new FileNotFoundException("wabbajack-cli.exe arşivde bulunamadı.");
        state.WabbajackVersion = wabbajack.Version;
        state.Save();
    }

    private string CliPath() =>
        Directory.Exists(state.WabbajackDir)
            ? Directory.EnumerateFiles(state.WabbajackDir, "wabbajack-cli.exe", SearchOption.AllDirectories).FirstOrDefault() ?? ""
            : "";

    private async Task RunWabbajackAsync(string wabbajackFile, IProgress<InstallProgress> progress, CancellationToken ct)
    {
        Directory.CreateDirectory(state.DownloadsDir);
        var logPath = Path.Combine(state.InstallRoot, "install.log");
        var psi = new ProcessStartInfo(CliPath())
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(CliPath())!,
        };
        foreach (var arg in new[] { "install", "-w", wabbajackFile, "-o", state.ModlistDir, "-d", state.DownloadsDir })
            psi.ArgumentList.Add(arg);

        progress.Report(new("Kurulum başlıyor", null, null));
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Kurulum aracı başlatılamadı.");
        await using var log = new StreamWriter(logPath, append: false);
        var lastError = "";

        async Task Pump(StreamReader reader)
        {
            while (await reader.ReadLineAsync(ct) is { } line)
            {
                lock (log) log.WriteLine(line);
                if (line.Contains("[ERROR]", StringComparison.Ordinal) || line.Contains("Exception", StringComparison.Ordinal))
                    lastError = line;
                var p = Interpret(line);
                if (p is not null) progress.Report(p);
            }
        }

        await using var _ = ct.Register(() => { try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { } });
        await Task.WhenAll(Pump(process.StandardOutput), Pump(process.StandardError), process.WaitForExitAsync(ct));

        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"Kurulum başarısız oldu (kod {process.ExitCode}). Ayrıntı: {logPath}" +
                (lastError.Length > 0 ? $"\n{Trim(lastError)}" : ""));
    }

    /// <summary>Maps wabbajack-cli log lines to a coarse phase for the UI.</summary>
    private static InstallProgress? Interpret(string line)
    {
        var text = Trim(LogPrefix().Replace(line, ""));
        if (text.Length == 0) return null;
        var fraction = Counter().Match(text) is { Success: true } m && double.TryParse(m.Groups[2].Value, out var total) && total > 0
            ? double.Parse(m.Groups[1].Value) / total
            : (double?)null;

        string phase =
            text.Contains("Download", StringComparison.OrdinalIgnoreCase) ? "Modlar indiriliyor" :
            text.Contains("Hash", StringComparison.OrdinalIgnoreCase) || text.Contains("Verif", StringComparison.OrdinalIgnoreCase) ? "Dosyalar doğrulanıyor" :
            text.Contains("Extract", StringComparison.OrdinalIgnoreCase) ? "Arşivler açılıyor" :
            text.Contains("Patch", StringComparison.OrdinalIgnoreCase) ? "Oyun 1.6.1170'e hazırlanıyor" :
            text.Contains("Install", StringComparison.OrdinalIgnoreCase) || text.Contains("Writ", StringComparison.OrdinalIgnoreCase) ? "Dosyalar yerleştiriliyor" :
            "Kuruluyor";
        return new InstallProgress(phase, fraction, text);
    }

    private static double? Fraction((long done, long total) p) => p.total > 0 ? (double)p.done / p.total : null;
    private static string Mb((long done, long total) p) => $"{p.done / 1048576.0:0} / {p.total / 1048576.0:0} MB";
    private static string Trim(string s) => s.Length > 160 ? s[..157] + "…" : s.Trim();
    private static void TryDelete(string path) { try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { } }

    [GeneratedRegex(@"^\s*[\d:.]+\s*\[\w+\]\s*")] private static partial Regex LogPrefix();
    [GeneratedRegex(@"(\d+)\s*/\s*(\d+)")] private static partial Regex Counter();
}
