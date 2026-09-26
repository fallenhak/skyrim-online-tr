using System.Windows;
using System.Windows.Threading;
using SkyrimOnlineTR.Launcher.Core;

namespace SkyrimOnlineTR.Launcher;

public partial class App : Application
{
    private Mutex? _singleInstance;

    protected override void OnStartup(StartupEventArgs e)
    {
        var mutexName = Environment.GetEnvironmentVariable("SOTR_HOME") is null ? "SkyrimOnlineTR.Launcher.SingleInstance" : "SkyrimOnlineTR.Launcher.Test";
        _singleInstance = new Mutex(true, mutexName, out var first);
        if (!first)
        {
            MessageBox.Show("Skyrim Online TR launcher zaten açık.", "Skyrim Online TR");
            Shutdown();
            return;
        }

        SelfUpdater.CleanupPreviousVersion();
        DispatcherUnhandledException += OnUnhandled;
        base.OnStartup(e);
    }

    private static void OnUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        File.AppendAllText(Path.Combine(LauncherConfig.AppDataDir, "launcher.log"), $"{DateTime.Now:u} {e.Exception}\n");
        MessageBox.Show(e.Exception.Message, "Skyrim Online TR — beklenmeyen hata", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }
}
