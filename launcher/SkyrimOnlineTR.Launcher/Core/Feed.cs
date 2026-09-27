using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>A downloadable file pinned by size and SHA-256.</summary>
public sealed record FeedFile(
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("sha256")] string Sha256,
    [property: JsonPropertyName("size")] long Size);

public sealed record FeedServer(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("host")] string Host,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("statusUrl")] string? StatusUrl,
    [property: JsonPropertyName("discordUrl")] string? DiscordUrl = null);

public sealed record FeedNews(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("body")] string Body,
    [property: JsonPropertyName("date")] string Date);

public sealed record FeedPatchNote(
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("date")] string Date,
    [property: JsonPropertyName("changes")] List<string> Changes);

public sealed record FeedMod(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("author")] string? Author,
    [property: JsonPropertyName("about")] string? About);

public sealed record Feed(
    [property: JsonPropertyName("launcher")] FeedFile Launcher,
    [property: JsonPropertyName("modlist")] FeedFile Modlist,
    [property: JsonPropertyName("wabbajack")] FeedFile Wabbajack,
    [property: JsonPropertyName("downgrade")] FeedFile Downgrade,
    [property: JsonPropertyName("server")] FeedServer Server,
    [property: JsonPropertyName("news")] List<FeedNews>? News,
    [property: JsonPropertyName("patchNotes")] List<FeedPatchNote>? PatchNotes = null,
    [property: JsonPropertyName("mods")] List<FeedMod>? Mods = null,
    [property: JsonPropertyName("rules")] List<string>? Rules = null)
{
    public static async Task<Feed> FetchAsync(HttpClient http, CancellationToken ct)
    {
        // Cache-buster: the feed is tiny and must never be stale after a release.
        var url = $"{LauncherConfig.FeedUrl}?t={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
        return await http.GetFromJsonAsync<Feed>(url, ct)
               ?? throw new InvalidDataException("Güncelleme bilgisi boş geldi.");
    }
}
