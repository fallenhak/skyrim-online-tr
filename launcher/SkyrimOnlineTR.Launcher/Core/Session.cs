using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Claims of a sos-auth session token. The launcher only reads them; the server verifies the signature.</summary>
public sealed record Session(string Token, string DiscordId, string Name, string AvatarUrl, DateTimeOffset ExpiresAt)
{
    public bool IsExpired => ExpiresAt <= DateTimeOffset.UtcNow.AddMinutes(1);

    public static Session? FromToken(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        try
        {
            using var doc = JsonDocument.Parse(Base64UrlDecode(parts[1]));
            var root = doc.RootElement;
            var sub = root.GetProperty("sub").GetString() ?? "";
            if (!sub.StartsWith("discord:", StringComparison.Ordinal)) return null;
            return new Session(
                token,
                sub["discord:".Length..],
                root.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                root.TryGetProperty("avatar", out var a) ? a.GetString() ?? "" : "",
                DateTimeOffset.FromUnixTimeSeconds(root.GetProperty("exp").GetInt64()));
        }
        catch (Exception e) when (e is JsonException or FormatException or KeyNotFoundException or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>
    /// Stable SkyMP profile id for this Discord account. Offline-mode SkyMP keys characters by
    /// profileId, so every player needs a distinct one or they share a character.
    /// </summary>
    public int SkympProfileId
    {
        get
        {
            var hash = SHA256.HashData(Encoding.ASCII.GetBytes("sotr-profile:" + DiscordId));
            return (int)(BitConverter.ToUInt32(hash, 0) & 0x3FFFFFFF) + 1;
        }
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}

/// <summary>Stores the token encrypted for the current Windows user (DPAPI).</summary>
public static class SessionStore
{
    private static string FilePath => Path.Combine(LauncherConfig.AppDataDir, "session.bin");
    private static readonly byte[] Entropy = Encoding.ASCII.GetBytes("SkyrimOnlineTR.session.v1");

    public static Session? Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            var plain = ProtectedData.Unprotect(File.ReadAllBytes(FilePath), Entropy, DataProtectionScope.CurrentUser);
            return Session.FromToken(Encoding.UTF8.GetString(plain));
        }
        catch (Exception e) when (e is CryptographicException or IOException)
        {
            return null;
        }
    }

    public static void Save(Session session)
    {
        var cipher = ProtectedData.Protect(Encoding.UTF8.GetBytes(session.Token), Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(FilePath, cipher);
    }

    public static void Clear()
    {
        try { File.Delete(FilePath); } catch (IOException) { }
    }
}
