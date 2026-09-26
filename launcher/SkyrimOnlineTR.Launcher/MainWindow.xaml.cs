using System.Net.Http;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
using SkyrimOnlineTR.Launcher.Core;

namespace SkyrimOnlineTR.Launcher;

public partial class MainWindow : Window
{
    private enum Mode { Busy, Login, Install, Update, Play, Running, Offline }

    private static readonly TimeSpan UpdateCheckInterval = TimeSpan.FromMinutes(10);

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(30) };
    private readonly InstallState _state = InstallState.Load();
    private readonly DispatcherTimer _pollTimer = new() { Interval = UpdateCheckInterval };
    private readonly DispatcherTimer _gameWatch = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly Snowfall _snow;

    private Feed? _feed;
    private Session? _session;
    private Mode _mode = Mode.Busy;
    private bool _working;

    public MainWindow()
    {
        InitializeComponent();
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"SkyrimOnlineTR-Launcher/{LauncherConfig.CurrentVersion}");
        _snow = new Snowfall(SnowLayer);
        LauncherVersionText.Text = LauncherConfig.CurrentVersion.ToString(3);
        InstallDirText.Text = _state.InstallRoot;
        ModlistVersionText.Text = _state.ModlistVersion ?? "kurulu değil";

        _pollTimer.Tick += async (_, _) => await CheckForUpdatesAsync(silent: true);
        _gameWatch.Tick += (_, _) => { if (_mode == Mode.Running && !GameRunner.IsGameRunning(_state)) { _gameWatch.Stop(); Refresh(); } };
        Loaded += async (_, _) => await StartupAsync();
        Closed += (_, _) => _snow.Stop();
    }

    // ---------- Startup ----------

    private async Task StartupAsync()
    {
        SetPhase("Diyar ile bağlantı kuruluyor", null, null);
        await CheckForUpdatesAsync(silent: false);
        await RestoreSessionAsync();
        Refresh();
        _pollTimer.Start();
    }

    private async Task CheckForUpdatesAsync(bool silent)
    {
        try
        {
            _feed = await Feed.FetchAsync(_http, CancellationToken.None);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or InvalidDataException or System.Text.Json.JsonException)
        {
            if (!silent) SetPhase("Güncelleme sunucusuna ulaşılamadı", null, e.Message);
            return;
        }

        NewsList.ItemsSource = _feed.News;
        ServerName.Text = _feed.Server.Name;
        _ = UpdateServerStatusAsync(_feed.Server);

        // Self-update happens right away unless the player is mid-install or in game.
        if (SelfUpdater.IsNewer(_feed.Launcher) && !_working && !GameRunner.IsGameRunning(_state))
        {
            await RunWorkAsync(async ct =>
            {
                SetPhase($"Launcher {_feed.Launcher.Version} sürümüne güncelleniyor", 0, null);
                await SelfUpdater.UpdateAndRestartAsync(_http, _feed.Launcher, DownloadProgress("Launcher güncelleniyor"), ct);
            });
            return;
        }
        if (silent && !_working) Refresh();
    }

    private async Task UpdateServerStatusAsync(FeedServer server)
    {
        var online = false;
        if (server.StatusUrl is { Length: > 0 } url)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                using var response = await _http.GetAsync(url, cts.Token);
                online = response.IsSuccessStatusCode;
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { }
        }
        ServerDot.Fill = (Brush)FindResource(online ? "Ok" : "Danger");
        ServerStatus.Text = online ? "Çevrimiçi" : "Ulaşılamıyor";
    }

    /// <summary>A stored token is refreshed on every start, so an active player never sees the login screen.</summary>
    private async Task RestoreSessionAsync()
    {
        var stored = SessionStore.Load();
        if (stored is null) return;
        try
        {
            var refreshed = await new DiscordAuth(_http).RefreshAsync(stored, CancellationToken.None);
            if (refreshed is null) { SessionStore.Clear(); return; }
            SetSession(refreshed);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            // Auth server unreachable: keep an unexpired session so a hiccup does not lock players out.
            if (!stored.IsExpired) SetSession(stored);
        }
    }

    private void SetSession(Session? session)
    {
        _session = session;
        if (session is null)
        {
            SessionStore.Clear();
            UserChip.Visibility = Visibility.Collapsed;
            return;
        }
        SessionStore.Save(session);
        UserName.Text = session.Name;
        UserChip.Visibility = Visibility.Visible;
        if (Uri.TryCreate(session.AvatarUrl, UriKind.Absolute, out var avatar))
        {
            try { AvatarBrush.ImageSource = new BitmapImage(avatar); } catch (Exception) { AvatarBrush.ImageSource = null; }
        }
    }

    // ---------- State ----------

    private void Refresh()
    {
        ModlistVersionText.Text = _state.ModlistVersion ?? "kurulu değil";
        if (_working) return;

        if (GameRunner.IsGameRunning(_state)) SetMode(Mode.Running);
        else if (_session is null) SetMode(Mode.Login);
        else if (_feed is null) SetMode(_state.IsInstalled ? Mode.Play : Mode.Offline);
        else if (!_state.IsInstalled) SetMode(Mode.Install);
        else if (new GameInstaller(_http, _state).NeedsUpdate(_feed)) SetMode(Mode.Update);
        else SetMode(Mode.Play);
    }

    private void SetMode(Mode mode)
    {
        _mode = mode;
        (ActionButton.Content, ActionButton.IsEnabled, var phase, var detail) = mode switch
        {
            Mode.Login => ("DISCORD İLE GİR", true, "Hoş geldin, gezgin", "Oynamak için Discord hesabınla giriş yap."),
            Mode.Install => ("KUR", true, "Kurulum gerekli", $"Oyun {_state.InstallRoot} klasörüne kurulacak. Steam'deki Skyrim'ine dokunulmaz."),
            Mode.Update => ("GÜNCELLE", true, "Güncelleme hazır", $"Yeni sürüm: {_feed?.Modlist.Version}"),
            Mode.Play => ("OYNA", true, "Hazır", _feed is null ? "Güncelleme sunucusuna ulaşılamadı; mevcut kurulumla oynanabilir." : "Kılıcını kuşan."),
            Mode.Running => ("OYUN AÇIK", false, "Oyun çalışıyor", "Oyunu kapatınca launcher tekrar hazır olur."),
            Mode.Offline => ("TEKRAR DENE", true, "Bağlantı yok", "İnternet bağlantını kontrol et."),
            _ => ("BEKLE", false, PhaseText.Text, DetailText.Text),
        };
        SetPhase(phase, null, detail);
        InstallDirButton.IsEnabled = mode is Mode.Login or Mode.Install;
    }

    private async void OnAction(object sender, RoutedEventArgs e)
    {
        switch (_mode)
        {
            case Mode.Login:
                await RunWorkAsync(async ct =>
                {
                    SetPhase("Tarayıcıda Discord girişi bekleniyor", null, "Açılan sayfada izin verip bu pencereye dön.");
                    SetSession(await new DiscordAuth(_http).LoginAsync(ct));
                    Activate();
                });
                break;
            case Mode.Install:
            case Mode.Update:
                await RunWorkAsync(async ct =>
                {
                    await new GameInstaller(_http, _state).InstallAsync(_feed!, InstallProgressReporter(), ct);
                });
                break;
            case Mode.Play:
                await PlayAsync();
                break;
            case Mode.Offline:
                await StartupAsync();
                break;
        }
    }

    private async Task PlayAsync()
    {
        await RunWorkAsync(async ct =>
        {
            // The session is renewed on every launch as well.
            SetPhase("Oturum yenileniyor", null, null);
            var refreshed = await new DiscordAuth(_http).RefreshAsync(_session!, ct);
            if (refreshed is null)
            {
                SetSession(null);
                throw new InvalidOperationException("Oturumun süresi doldu. Tekrar Discord ile giriş yap.");
            }
            SetSession(refreshed);

            if (_feed is null) throw new InvalidOperationException("Sunucu bilgisi alınamadı.");
            SetPhase("Skyrim başlatılıyor", null, "MO2 ve SKSE açılıyor…");
            GameRunner.Launch(_state, _feed, refreshed);
            await Task.Delay(TimeSpan.FromSeconds(8), ct);
        });
        if (GameRunner.IsGameRunning(_state))
        {
            SetMode(Mode.Running);
            _gameWatch.Start();
            WindowState = WindowState.Minimized;
        }
    }

    private async Task RunWorkAsync(Func<CancellationToken, Task> work)
    {
        if (_working) return;
        _working = true;
        ActionButton.IsEnabled = false;
        ActionButton.Content = "BEKLE";
        Progress.Visibility = Visibility.Visible;
        Progress.IsIndeterminate = true;
        try
        {
            await work(CancellationToken.None);
            _working = false;
            Refresh();
        }
        catch (Exception e)
        {
            _working = false;
            Refresh();
            SetPhase("Bir sorun çıktı", null, e.Message);
            File.AppendAllText(Path.Combine(LauncherConfig.AppDataDir, "launcher.log"), $"{DateTime.Now:u} {e}\n");
        }
        finally
        {
            Progress.Visibility = Visibility.Hidden;
            PercentText.Text = "";
        }
    }

    // ---------- Progress ----------

    private void SetPhase(string phase, double? fraction, string? detail)
    {
        PhaseText.Text = phase;
        DetailText.Text = detail ?? "";
        if (fraction is { } f)
        {
            Progress.IsIndeterminate = false;
            Progress.Value = Math.Clamp(f, 0, 1);
            PercentText.Text = $"%{f * 100:0}";
        }
        else
        {
            Progress.IsIndeterminate = true;
            PercentText.Text = "";
        }
    }

    private IProgress<(long done, long total)> DownloadProgress(string phase) =>
        new Progress<(long done, long total)>(p =>
            SetPhase(phase, p.total > 0 ? (double)p.done / p.total : null, $"{p.done / 1048576.0:0} / {p.total / 1048576.0:0} MB"));

    private IProgress<InstallProgress> InstallProgressReporter() =>
        new Progress<InstallProgress>(p => SetPhase(p.Phase, p.Fraction, p.Detail));

    // ---------- Chrome ----------

    private void OnChangeInstallDir(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Skyrim Online TR kurulum klasörü", InitialDirectory = _state.InstallRoot };
        if (dialog.ShowDialog(this) != true) return;
        var chosen = Path.Combine(dialog.FolderName, "SkyrimOnlineTR");
        if (chosen.Contains(@"\Program Files", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(this, "Program Files içine kurulum yapılamaz; başka bir klasör seç.", "Skyrim Online TR");
            return;
        }
        _state.InstallRoot = chosen;
        _state.ModlistVersion = null;
        _state.Save();
        InstallDirText.Text = chosen;
        Refresh();
    }

    private void OnLogout(object sender, RoutedEventArgs e)
    {
        SetSession(null);
        Refresh();
    }

    private void OnDrag(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void OnClose(object sender, RoutedEventArgs e)
    {
        if (_working && MessageBox.Show(this, "Kurulum sürüyor. Kapatırsan yarım kalır; bir sonraki açılışta kaldığı yerden devam eder. Kapatılsın mı?",
                "Skyrim Online TR", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        Close();
    }
}
