using System.Text.Json;
using System.Text.Json.Serialization;

namespace SkyrimOnlineTR.Launcher.Core;

/// <summary>Launcher settings plus what is installed where. Kept per Windows user.</summary>
public sealed class InstallState
{
    [JsonPropertyName("installRoot")] public string InstallRoot { get; set; } = LauncherConfig.DefaultInstallRoot;
    [JsonPropertyName("modlistVersion")] public string? ModlistVersion { get; set; }
    [JsonPropertyName("wabbajackVersion")] public string? WabbajackVersion { get; set; }

    [JsonIgnore] public string ModlistDir => Path.Combine(InstallRoot, "Modlist");
    [JsonIgnore] public string DownloadsDir => Path.Combine(InstallRoot, "Downloads");
    [JsonIgnore] public string WabbajackDir => Path.Combine(InstallRoot, "Tools", "Wabbajack");
    [JsonIgnore] public string Mo2Exe => Path.Combine(ModlistDir, "ModOrganizer.exe");
    [JsonIgnore] public bool IsInstalled => ModlistVersion is not null && File.Exists(Mo2Exe);

    private static string FilePath => Path.Combine(LauncherConfig.AppDataDir, "state.json");
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public static InstallState Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<InstallState>(File.ReadAllText(FilePath)) ?? new InstallState();
        }
        catch (Exception e) when (e is JsonException or IOException) { }
        return new InstallState();
    }

    public void Save() => File.WriteAllText(FilePath, JsonSerializer.Serialize(this, Options));
}
