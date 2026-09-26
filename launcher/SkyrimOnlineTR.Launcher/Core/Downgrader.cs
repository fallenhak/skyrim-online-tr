using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>
/// Turns the modlist's Stock Game (a copy of the player's Steam 1.7.104 files, made by Wabbajack)
/// into 1.6.1170 with HDiffPatch patches. Only the copy is touched; the Steam install never is.
/// Idempotent: files already at the target hash are skipped.
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

    private sealed record PatchManifest(
        [property: JsonPropertyName("from")] string From,
        [property: JsonPropertyName("to")] string To,
        [property: JsonPropertyName("files")] List<PatchEntry> Files);

    private string StockGameDir => Path.Combine(state.ModlistDir, "Stock Game");

    public async Task ApplyAsync(FeedFile manifestFile, IProgress<InstallProgress> progress, CancellationToken ct)
    {
        progress.Report(new("Oyun sürümü kontrol ediliyor", null, null));
        var manifest = await http.GetFromJsonAsync<PatchManifest>(manifestFile.Url, ct)
                       ?? throw new InvalidDataException("Yama listesi okunamadı.");

        var patchDir = Path.Combine(state.InstallRoot, "Tools", "patches");
        Directory.CreateDirectory(patchDir);
        var hpatchz = ExtractHpatchz();

        for (var i = 0; i < manifest.Files.Count; i++)
        {
            var entry = manifest.Files[i];
            var target = Path.Combine(StockGameDir, entry.Path);
            var label = $"{i + 1}/{manifest.Files.Count} · {entry.Path}";
            progress.Report(new($"Oyun {manifest.To} sürümüne düşürülüyor", (double)i / manifest.Files.Count, label));

            if (!File.Exists(target))
                throw new FileNotFoundException($"Oyun dosyası eksik: {entry.Path}. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");

            var current = await Downloader.Sha256Async(target, ct);
            if (current == entry.DstSha256) continue;
            if (current != entry.SrcSha256)
                throw new InvalidDataException(
                    $"{entry.Path} beklenen {manifest.From} sürümünde değil. Steam'de dosya bütünlüğünü doğrulayıp tekrar dene.");

            var patch = Path.Combine(patchDir, Path.GetFileName(new Uri(entry.Url).LocalPath));
            await Downloader.DownloadVerifiedAsync(http, new FeedFile(manifest.To, entry.Url, "", entry.PatchSize), patch, null, ct, verifyHash: false);

            var output = target + ".new";
            await RunHpatchzAsync(hpatchz, target, patch, output, ct);
            if (await Downloader.Sha256Async(output, ct) != entry.DstSha256)
            {
                File.Delete(output);
                throw new InvalidDataException($"{entry.Path} yamalanamadı (hash uyuşmuyor).");
            }
            File.Move(output, target, overwrite: true);
            File.Delete(patch);
        }
        progress.Report(new($"Oyun {manifest.To} sürümünde", 1, null));
    }

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
