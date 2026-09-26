using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>
/// Builds the launcher's own game folder (InstallRoot\Game) at 1.6.1170 from the player's Steam
/// Skyrim. Files that differ between versions are patched straight from the Steam copy with
/// HDiffPatch; the rest are copied. Creation Club content is never copied. The Steam install is
/// only read, never written.
/// </summary>
public sealed class Downgrader(HttpClient http, InstallState state)
{
    private sealed record PatchEntry(
        [property: JsonPropertyName("path")] string Path,
        [property: JsonPropertyName("src_sha256")] string SrcSha256,
        [property: JsonPropertyName("dst_sha256")] string DstSha256,
        [property: JsonPropertyName("dst_size")] long DstSize,
        [property: JsonPropertyName("patch_size")] long PatchSize,
        [property: JsonPropertyName("url")] string Url);

    private sealed record CopyEntry(
        [property: JsonPropertyName("path")] string Path,
        [property: JsonPropertyName("sha256")] string Sha256,
        [property: JsonPropertyName("size")] long Size);

    private sealed record PatchManifest(
        [property: JsonPropertyName("from")] string From,
        [property: JsonPropertyName("to")] string To,
        [property: JsonPropertyName("files")] List<PatchEntry> Files,
        [property: JsonPropertyName("copy")] List<CopyEntry>? Copy);

    private string MarkerPath => Path.Combine(state.GameDir, ".sotr-game.json");

    public async Task ApplyAsync(FeedFile manifestFile, IProgress<InstallProgress> progress, CancellationToken ct)
    {
        if (IsComplete(manifestFile)) return;

        progress.Report(new("Steam'deki Skyrim aranıyor", null, null));
        var steamDir = SteamLocator.FindSkyrimSE()
                       ?? throw new DirectoryNotFoundException("Steam'de Skyrim Special Edition bulunamadı. Oyunun Steam'de kurulu olması gerekiyor.");
        var manifest = await http.GetFromJsonAsync<PatchManifest>(manifestFile.Url, ct)
                       ?? throw new InvalidDataException("Yama listesi okunamadı.");

        Directory.CreateDirectory(state.GameDir);
        var patchDir = Path.Combine(state.InstallRoot, "Tools", "patches");
        Directory.CreateDirectory(patchDir);
        var hpatchz = ExtractHpatchz();

        var copies = manifest.Copy ?? [];
        var total = manifest.Files.Count + copies.Count;
        var done = 0;
        var title = $"Oyun {manifest.To} olarak hazırlanıyor";
        progress.Report(new(title, 0, $"0/{total}"));
        void Step(string path)
        {
            var n = Interlocked.Increment(ref done);
            progress.Report(new(title, (double)n / total, $"{n}/{total} · {path}"));
        }

        using var downloads = new SemaphoreSlim(4);
        using var disk = new SemaphoreSlim(3);

        var copyTasks = copies.Select(async entry =>
        {
            await disk.WaitAsync(ct);
            try { await CopyFileAsync(steamDir, entry, ct); }
            finally { disk.Release(); }
            Step(entry.Path);
        });

        var patchTasks = manifest.Files.Select(async entry =>
        {
            var source = Path.Combine(steamDir, entry.Path);
            if (!File.Exists(source))
                throw new FileNotFoundException($"Steam'deki oyunda dosya eksik: {entry.Path}. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");

            var patch = Path.Combine(patchDir, Path.GetFileName(new Uri(entry.Url).LocalPath));
            await downloads.WaitAsync(ct);
            try { await Downloader.DownloadVerifiedAsync(http, new FeedFile(manifest.To, entry.Url, "", entry.PatchSize), patch, null, ct, verifyHash: false); }
            finally { downloads.Release(); }

            await disk.WaitAsync(ct);
            try { await PatchFileAsync(hpatchz, manifest, entry, source, patch, ct); }
            finally { disk.Release(); }
            Step(entry.Path);
        });

        await Task.WhenAll(copyTasks.Concat(patchTasks));
        File.WriteAllText(MarkerPath, JsonSerializer.Serialize(new { version = manifest.To, manifest = manifestFile.Sha256 }));
        progress.Report(new($"Oyun {manifest.To} sürümünde", 1, null));
    }

    private bool IsComplete(FeedFile manifestFile)
    {
        try
        {
            if (!File.Exists(MarkerPath) || !File.Exists(Path.Combine(state.GameDir, "SkyrimSE.exe"))) return false;
            using var doc = JsonDocument.Parse(File.ReadAllText(MarkerPath));
            return doc.RootElement.GetProperty("manifest").GetString() == manifestFile.Sha256;
        }
        catch (Exception e) when (e is JsonException or IOException or KeyNotFoundException) { return false; }
    }

    private async Task CopyFileAsync(string steamDir, CopyEntry entry, CancellationToken ct)
    {
        var target = Path.Combine(state.GameDir, entry.Path);
        if (File.Exists(target) && new FileInfo(target).Length == entry.Size && await Downloader.Sha256Async(target, ct) == entry.Sha256) return;

        var source = Path.Combine(steamDir, entry.Path);
        if (!File.Exists(source))
            throw new FileNotFoundException($"Steam'deki oyunda dosya eksik: {entry.Path}. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using (var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20, true))
        await using (var output = new FileStream(target + ".new", FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, true))
            await input.CopyToAsync(output, ct);
        if (await Downloader.Sha256Async(target + ".new", ct) != entry.Sha256)
        {
            TryDelete(target + ".new");
            throw new InvalidDataException($"{entry.Path} Steam'deki oyunda beklenen dosya değil. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");
        }
        File.Move(target + ".new", target, overwrite: true);
    }

    private async Task PatchFileAsync(string hpatchz, PatchManifest manifest, PatchEntry entry, string source, string patch, CancellationToken ct)
    {
        var target = Path.Combine(state.GameDir, entry.Path);
        var output = target + ".new";
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        try
        {
            await RunHpatchzAsync(hpatchz, source, patch, output, ct);
        }
        catch (InvalidOperationException)
        {
            // Steam copy is not 1.7.104: fine if it is already the target version, otherwise unusable.
            TryDelete(output);
            if (await Downloader.Sha256Async(source, ct) != entry.DstSha256)
                throw new InvalidDataException(
                    $"{entry.Path} Steam'de beklenen {manifest.From} sürümünde değil. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");
            File.Copy(source, output, overwrite: true);
        }
        if (await Downloader.Sha256Async(output, ct) != entry.DstSha256)
        {
            TryDelete(output);
            throw new InvalidDataException($"{entry.Path} yamalanamadı (hash uyuşmuyor).");
        }
        File.Move(output, target, overwrite: true);
        TryDelete(patch);
    }

    private static void TryDelete(string path) { try { File.Delete(path); } catch (IOException) { } }

    private static async Task RunHpatchzAsync(string hpatchz, string oldFile, string patch, string newFile, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(hpatchz) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var a in new[] { "-f", oldFile, patch, newFile }) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi) ?? throw new InvalidOperationException("hpatchz başlatılamadı.");
        var err = p.StandardError.ReadToEndAsync(ct);
        _ = p.StandardOutput.ReadToEndAsync(ct);
        await p.WaitForExitAsync(ct);
        if (p.ExitCode != 0) throw new InvalidOperationException($"Yama uygulanamadı: {await err}");
    }

    private string ExtractHpatchz()
    {
        var path = Path.Combine(state.InstallRoot, "Tools", "hpatchz.exe");
        using var resource = typeof(Downgrader).Assembly.GetManifestResourceStream("hpatchz.exe")
                             ?? throw new InvalidOperationException("hpatchz gömülü değil.");
        if (File.Exists(path) && new FileInfo(path).Length == resource.Length) return path;
        using var file = File.Create(path);
        resource.CopyTo(file);
        return path;
    }
}
