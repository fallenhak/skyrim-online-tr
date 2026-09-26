using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using System.Web;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>
/// Discord login through sos-auth. The browser is sent to /auth/discord/start with a loopback
/// redirect; sos-auth returns the token in the URL fragment, which a tiny page posts back to us.
/// A raw TcpListener is used because HttpListener needs a URL ACL for 127.0.0.1 without admin rights.
/// </summary>
public sealed class DiscordAuth(HttpClient http)
{
    private sealed record RefreshResponse([property: JsonPropertyName("token")] string Token);

    /// <summary>Extends the 7-day token. Returns null when the server rejects it (expired or too old).</summary>
    public async Task<Session?> RefreshAsync(Session session, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{LauncherConfig.AuthBaseUrl}/refresh");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.Token);
        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Unauthorized) return null;
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<RefreshResponse>(ct);
        return body is null ? null : Session.FromToken(body.Token);
    }

    public async Task<Session> LoginAsync(CancellationToken ct)
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var redirect = $"http://127.0.0.1:{port}/callback";
            var state = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
            var start = $"{LauncherConfig.AuthBaseUrl}/discord/start?redirect_uri={Uri.EscapeDataString(redirect)}&state={state}";
            Process.Start(new ProcessStartInfo(start) { UseShellExecute = true });

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromMinutes(5));
            while (true)
            {
                TcpClient client;
                try
                {
                    client = await listener.AcceptTcpClientAsync(timeout.Token);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    throw new TimeoutException("Discord girişi zaman aşımına uğradı.");
                }

                using (client)
                {
                    var request = await ReadRequestAsync(client.GetStream(), timeout.Token);
                    if (request is null) continue;
                    var (method, path, body) = request.Value;
                    var stream = client.GetStream();

                    if (method == "GET" && path.StartsWith("/callback", StringComparison.Ordinal))
                    {
                        // The token is in the fragment, which browsers never send; this page forwards it.
                        await WriteResponseAsync(stream, "200 OK", "text/html", CallbackPage, timeout.Token);
                        continue;
                    }
                    if (method == "POST" && path == "/token")
                    {
                        await WriteResponseAsync(stream, "204 No Content", "text/plain", "", timeout.Token);
                        var fields = HttpUtility.ParseQueryString(body);
                        if (fields["state"] != state) continue;
                        var error = fields["error"];
                        if (!string.IsNullOrEmpty(error)) throw new InvalidOperationException($"Discord girişi başarısız: {error}");
                        return Session.FromToken(fields["token"] ?? "")
                               ?? throw new InvalidDataException("Giriş sunucusu geçersiz bir oturum döndürdü.");
                    }
                    await WriteResponseAsync(stream, "404 Not Found", "text/plain", "", timeout.Token);
                }
            }
        }
        finally
        {
            listener.Stop();
        }
    }

    private static async Task<(string method, string path, string body)?> ReadRequestAsync(NetworkStream stream, CancellationToken ct)
    {
        var buffer = new byte[16 * 1024];
        var total = 0;
        int headerEnd;
        while ((headerEnd = IndexOfHeaderEnd(buffer, total)) < 0)
        {
            if (total == buffer.Length) return null;
            var read = await stream.ReadAsync(buffer.AsMemory(total), ct);
            if (read == 0) return null;
            total += read;
        }

        var head = Encoding.ASCII.GetString(buffer, 0, headerEnd);
        var lines = head.Split("\r\n");
        var requestLine = lines[0].Split(' ');
        if (requestLine.Length < 2) return null;

        var contentLength = 0;
        foreach (var line in lines.Skip(1))
        {
            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                int.TryParse(line["Content-Length:".Length..].Trim(), out contentLength);
        }
        var bodyStart = headerEnd + 4;
        if (contentLength < 0 || bodyStart + contentLength > buffer.Length) return null;
        while (total < bodyStart + contentLength)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total), ct);
            if (read == 0) return null;
            total += read;
        }
        return (requestLine[0], requestLine[1], Encoding.UTF8.GetString(buffer, bodyStart, contentLength));
    }

    private static int IndexOfHeaderEnd(byte[] buffer, int length)
    {
        for (var i = 0; i + 3 < length; i++)
            if (buffer[i] == '\r' && buffer[i + 1] == '\n' && buffer[i + 2] == '\r' && buffer[i + 3] == '\n')
                return i;
        return -1;
    }

    private static async Task WriteResponseAsync(NetworkStream stream, string status, string type, string body, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        var head = $"HTTP/1.1 {status}\r\nContent-Type: {type}; charset=utf-8\r\nContent-Length: {bytes.Length}\r\n" +
                   "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(head), ct);
        await stream.WriteAsync(bytes, ct);
    }

    private const string CallbackPage = """
        <!doctype html><html lang="tr"><meta charset="utf-8"><title>Skyrim Online TR</title>
        <body style="background:#0e0d0b;color:#e8dcc0;font-family:Georgia,serif;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center"><h1 lang="en" style="letter-spacing:.2em;color:#c9a45c">SKYRIM ONLINE TR</h1>
        <p id="m">Giriş tamamlanıyor…</p></div>
        <script>
        fetch('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:location.hash.slice(1)})
          .then(()=>{history.replaceState(null,'','/callback');document.getElementById('m').textContent='Giriş tamam. Bu sekmeyi kapatıp launcher\'a dönebilirsin.';})
          .catch(()=>{document.getElementById('m').textContent='Launcher\'a ulaşılamadı. Launcher açık mı?';});
        </script></body></html>
        """;
}
