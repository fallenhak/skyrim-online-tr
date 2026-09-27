using System.Diagnostics;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Animation;
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

    private Feed? _feed;
    private Session? _session;
    private Mode _mode = Mode.Busy;
    private bool _working;

    public MainWindow()
    {
        InitializeComponent();
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"SkyrimOnlineTR-Launcher/{LauncherConfig.CurrentVersion}");
        LauncherVersionText.Text = LauncherConfig.CurrentVersion.ToString(3);
        InstallDirText.Text = _state.InstallRoot;
        HomeModlistText.Text = ModlistVersionText.Text = _state.ModlistVersion ?? "kurulu değil";
        BuildResolutionChoices();
        LoadDisplaySettings();
        _ = UpdateCacheSizeAsync();

        _pollTimer.Tick += async (_, _) => await CheckForUpdatesAsync(silent: true);
        _gameWatch.Tick += (_, _) => { if (_mode == Mode.Running && !GameRunner.IsGameRunning(_state)) { _gameWatch.Stop(); Refresh(); } };
        Loaded += async (_, _) => await StartupAsync();
    }

    // ---------- Startup ----------

    private async Task StartupAsync()
    {
        SetPhase("Sunucuya bağlanılıyor", null, null);
        Progress.IsIndeterminate = true;
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

        ShowFeed(_feed);
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

    private void ShowFeed(Feed feed)
    {
        var news = feed.News ?? [];
        HomeLead.DataContext = news.FirstOrDefault();
        HomeLead.Visibility = news.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        HomeNewsList.ItemsSource = news.Skip(1).Take(2).ToList();
        NewsList.ItemsSource = news;
        HomeNewsEmpty.Visibility = NewsEmpty.Visibility = news.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var patches = feed.PatchNotes ?? [];
        PatchList.ItemsSource = patches;
        PatchEmpty.Visibility = patches.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var mods = feed.Mods ?? [];
        ModList.ItemsSource = mods;
        ModsEmpty.Visibility = mods.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var rules = feed.Rules ?? [];
        RulesList.ItemsSource = rules;
        RulesEmpty.Visibility = rules.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        ServerName.Text = ServerTitle.Text = feed.Server.Name;
        ServerAddress.Text = $"Adres: {feed.Server.Host}:{feed.Server.Port}";
        DiscordBlock.Visibility = string.IsNullOrWhiteSpace(feed.Server.DiscordUrl) ? Visibility.Collapsed : Visibility.Visible;
    }

    private async Task UpdateServerStatusAsync(FeedServer server)
    {
        ServerStatus.Text = ServerStatus2.Text = "Kontrol ediliyor";
        long? ms = null;
        if (server.StatusUrl is { Length: > 0 } url)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var watch = Stopwatch.StartNew();
                using var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token);
                if (response.IsSuccessStatusCode) ms = watch.ElapsedMilliseconds;
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { }
        }
        var online = ms is not null;
        ServerDot.Fill = ServerDot2.Fill = (Brush)FindResource(online ? "Online" : "Offline");
        ServerStatus.Text = ServerStatus2.Text = online ? "Çevrimiçi" : "Ulaşılamıyor";
        ServerPing.Text = online ? $"{ms} ms" : "";
        ServerPing2.Text = online ? $"Gecikme: {ms} ms" : "Sunucu yanıt vermedi. Birazdan tekrar dene; sorun sürerse Discord'dan haber ver.";
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
        HomeModlistText.Text = ModlistVersionText.Text = _state.ModlistVersion ?? "kurulu değil";
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
            Mode.Login => ("Discord ile gir", true, "Hoş geldin, gezgin", "Oynamak için Discord hesabınla giriş yap."),
            Mode.Install => ("Kur", true, "Kurulum gerekli", $"Oyun {_state.InstallRoot} klasörüne kurulacak. Steam'deki Skyrim'ine dokunulmaz."),
            Mode.Update => ("Güncelle", true, "Güncelleme hazır", $"Yeni sürüm: {_feed?.Modlist.Version}"),
            Mode.Play => ("Oyna", true, "Hazır", _feed is null ? "Güncelleme sunucusuna ulaşılamadı; mevcut kurulumla oynanabilir." : "Kılıcını kuşan."),
            Mode.Running => ("Oyun açık", false, "Oyun çalışıyor", "Oyunu kapatınca launcher tekrar hazır olur."),
            Mode.Offline => ("Tekrar dene", true, "Bağlantı yok", "İnternet bağlantını kontrol et."),
            _ => ("Bekle", false, PhaseText.Text, DetailText.Text),
        };
        SetPhase(phase, null, detail);
        ShowBandFinished();
        InstallDirButton.IsEnabled = mode is Mode.Login or Mode.Install;
        RepairButton.IsEnabled = _feed is not null && _state.IsInstalled && mode is Mode.Play or Mode.Update;
        ClearCacheButton.IsEnabled = mode is not Mode.Running;
        LoadDisplaySettings();
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
        ActionButton.Content = "Bekle";
        RepairButton.IsEnabled = ClearCacheButton.IsEnabled = false;
        Progress.BeginAnimation(WovenBand.ValueProperty, null);
        Progress.Value = 0;
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
            PercentText.Text = "";
        }
    }

    // ---------- Progress ----------

    private bool _bandWoven;

    /// <summary>At rest the band is fully woven. The first time, it weaves itself in once.</summary>
    private void ShowBandFinished()
    {
        Progress.IsIndeterminate = false;
        if (_bandWoven) { Progress.Value = 1; return; }
        _bandWoven = true;
        var from = Progress.Value;
        Progress.Value = 1;
        if (SystemParameters.ClientAreaAnimation)
            Progress.BeginAnimation(WovenBand.ValueProperty, new DoubleAnimation(from, 1, TimeSpan.FromMilliseconds(1100))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
                FillBehavior = FillBehavior.Stop,
            });
    }

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
            if (_working) Progress.IsIndeterminate = true;
            PercentText.Text = "";
        }
    }

    private IProgress<(long done, long total)> DownloadProgress(string phase) =>
        new Progress<(long done, long total)>(p =>
            SetPhase(phase, p.total > 0 ? (double)p.done / p.total : null, $"{p.done / 1048576.0:0} / {p.total / 1048576.0:0} MB"));

    private IProgress<InstallProgress> InstallProgressReporter() =>
        new Progress<InstallProgress>(p => SetPhase(p.Phase, p.Fraction, p.Detail));

    // ---------- Pages ----------

    private void OnNav(object sender, RoutedEventArgs e)
    {
        if (Pages is null || sender is not RadioButton { Tag: string name }) return;
        foreach (var page in Pages.Children.OfType<FrameworkElement>())
            page.Visibility = page.Name == name ? Visibility.Visible : Visibility.Collapsed;
        if (Pages.FindName(name) is FrameworkElement shown && SystemParameters.ClientAreaAnimation)
            shown.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(160)));
        if (name == "PageSettings") _ = UpdateCacheSizeAsync();
    }

    private void OnGoTo(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string name }) return;
        foreach (var item in Nav.Children.OfType<RadioButton>())
            if (item.Tag as string == name) item.IsChecked = true;
    }

    private async void OnRefreshServer(object sender, RoutedEventArgs e)
    {
        if (_feed is not null) await UpdateServerStatusAsync(_feed.Server);
        else await CheckForUpdatesAsync(silent: false);
    }

    private void OnOpenDiscord(object sender, RoutedEventArgs e)
    {
        if (_feed?.Server.DiscordUrl is { Length: > 0 } url) Open(url);
    }

    // ---------- Settings ----------

    private static readonly (int w, int h)[] Resolutions =
        [(1280, 720), (1600, 900), (1920, 1080), (2560, 1080), (2560, 1440), (3440, 1440), (3840, 2160)];

    private void BuildResolutionChoices()
    {
        foreach (var (w, h) in Resolutions)
            ResolutionChoices.Children.Add(new RadioButton
            {
                Style = (Style)FindResource("Choice"), GroupName = "Resolution", Content = $"{w} × {h}", Tag = (w, h),
            });
    }

    private void LoadDisplaySettings()
    {
        var display = new DisplaySettings(_state);
        var available = display.Available;
        DisplayPanel.Visibility = available ? Visibility.Visible : Visibility.Collapsed;
        DisplayUnavailable.Visibility = available ? Visibility.Collapsed : Visibility.Visible;
        if (!available) return;
        try
        {
            var (mode, w, h) = display.Read();
            (mode switch { WindowMode.Fullscreen => ModeFullscreen, WindowMode.Borderless => ModeBorderless, _ => ModeWindowed }).IsChecked = true;
            foreach (var choice in ResolutionChoices.Children.OfType<RadioButton>())
                choice.IsChecked = choice.Tag is ValueTuple<int, int> r && r.Item1 == w && r.Item2 == h;
        }
        catch (IOException) { }
    }

    private void OnSaveDisplay(object sender, RoutedEventArgs e)
    {
        var mode = ModeFullscreen.IsChecked == true ? WindowMode.Fullscreen : ModeBorderless.IsChecked == true ? WindowMode.Borderless : WindowMode.Windowed;
        if (ResolutionChoices.Children.OfType<RadioButton>().FirstOrDefault(c => c.IsChecked == true)?.Tag is not ValueTuple<int, int> r)
        {
            DisplayNote.Text = "Önce bir çözünürlük seç.";
            return;
        }
        try
        {
            new DisplaySettings(_state).Write(mode, r.Item1, r.Item2);
            DisplayNote.Text = "Kaydedildi. Oyunu bir sonraki açışında geçerli olur.";
        }
        catch (IOException ex) { DisplayNote.Text = $"Kaydedilemedi: {ex.Message}"; }
    }

    private async void OnRepair(object sender, RoutedEventArgs e)
    {
        if (_feed is null || !_state.IsInstalled) return;
        var ok = false;
        await RunWorkAsync(async ct =>
        {
            SetPhase("Dosyalar onarılıyor", null, "Her dosya kontrol ediliyor; bozuk ya da eksik olanlar yeniden indirilecek.");
            await new GameInstaller(_http, _state).InstallAsync(_feed, InstallProgressReporter(), ct);
            ok = true;
        });
        if (ok) SetPhase("Dosyalar onarıldı", null, "Her şey yerinde.");
    }

    private async Task UpdateCacheSizeAsync()
    {
        var dir = _state.DownloadsDir;
        var bytes = await Task.Run(() =>
            Directory.Exists(dir) ? new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) : 0);
        CacheText.Text = bytes == 0
            ? "İndirilmiş mod arşivi yok."
            : $"İndirilen mod arşivleri {bytes / 1073741824.0:0.0} GB yer kaplıyor. Silersen oyun çalışmaya devam eder; bir sonraki güncellemede gerekenler yeniden indirilir.";
        ClearCacheButton.Visibility = bytes == 0 ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void OnClearCache(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, "İndirilen mod arşivleri silinsin mi?", "Skyrim Online TR", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        await Task.Run(() =>
        {
            foreach (var file in Directory.EnumerateFiles(_state.DownloadsDir, "*", SearchOption.AllDirectories))
                try { File.Delete(file); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        });
        await UpdateCacheSizeAsync();
    }

    private void OnOpenInstallDir(object sender, RoutedEventArgs e) => OpenFolder(_state.InstallRoot);

    private void OnOpenCrashLogs(object sender, RoutedEventArgs e) =>
        OpenFolder(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "My Games", "Skyrim Special Edition", "SKSE"));

    private void OnOpenLauncherLogs(object sender, RoutedEventArgs e) => OpenFolder(LauncherConfig.AppDataDir);

    private void OpenFolder(string dir)
    {
        if (Directory.Exists(dir)) Open(dir);
        else SetPhase("Klasör bulunamadı", null, $"{dir} henüz oluşmamış.");
    }

    private static void Open(string target) => Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });

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
