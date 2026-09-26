using System.Net.Http;
using System.Security.Cryptography;

namespace SkyrimOnlineTR.Launcher.Core;

public static class Downloader
{
    /// <summary>
    /// Downloads to <paramref name="destination"/> via a .part file and verifies the SHA-256.
    /// An existing file with the right hash is reused without downloading.
    /// </summary>
    public static async Task DownloadVerifiedAsync(HttpClient http, FeedFile file, string destination,
        IProgress<(long done, long total)>? progress, CancellationToken ct, bool verifyHash = true)
    {
        if (verifyHash && File.Exists(destination) && await Sha256Async(destination, ct) == Normalize(file.Sha256))
        {
            progress?.Report((file.Size, file.Size));
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        var part = destination + ".part";
        using (var response = await http.GetAsync(file.Url, HttpCompletionOption.ResponseHeadersRead, ct))
        {
            response.EnsureSuccessStatusCode();
            var total = response.Content.Headers.ContentLength ?? file.Size;
            await using var input = await response.Content.ReadAsStreamAsync(ct);
            await using var output = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, true);
            var buffer = new byte[1 << 20];
            long done = 0;
            int read;
            var lastReport = Environment.TickCount64;
            while ((read = await input.ReadAsync(buffer, ct)) > 0)
            {
                await output.WriteAsync(buffer.AsMemory(0, read), ct);
                done += read;
                if (Environment.TickCount64 - lastReport > 100)
                {
                    progress?.Report((done, total));
                    lastReport = Environment.TickCount64;
                }
            }
            progress?.Report((done, total));
        }

        if (verifyHash && await Sha256Async(part, ct) != Normalize(file.Sha256))
        {
            File.Delete(part);
            throw new InvalidDataException($"İndirilen dosya bozuk ({Path.GetFileName(destination)}). Tekrar dene.");
        }
        File.Move(part, destination, overwrite: true);
    }

    public static async Task<string> Sha256Async(string path, CancellationToken ct)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20, true);
        return Convert.ToHexStringLower(await SHA256.HashDataAsync(stream, ct));
    }

    private static string Normalize(string hash) => hash.Trim().ToLowerInvariant();
}
