using System.Windows;
using System.Windows.Media;

namespace SkyrimOnlineTR.Launcher;

/// <summary>
/// A tablet-woven band, like the trim on Nord clothing, that doubles as the progress bar:
/// the woven part is the finished share, the rest shows bare warp threads.
/// </summary>
public sealed class WovenBand : FrameworkElement
{
    private const double PickWidth = 6;
    private const int Rows = 12;
    private const int Period = 18;

    private static readonly Color Woad = Color.FromRgb(0x4A, 0x6F, 0xA5);
    private static readonly Color WoadDeep = Color.FromRgb(0x2C, 0x3F, 0x63);
    private static readonly Color Madder = Color.FromRgb(0xA8, 0x40, 0x2F);
    private static readonly Color Weld = Color.FromRgb(0xD9, 0xB8, 0x4E);
    private static readonly Color Wool = Color.FromRgb(0xEA, 0xE4, 0xD6);

    public static readonly DependencyProperty ValueProperty = DependencyProperty.Register(
        nameof(Value), typeof(double), typeof(WovenBand),
        new FrameworkPropertyMetadata(1.0, FrameworkPropertyMetadataOptions.AffectsRender));

    public static readonly DependencyProperty IsIndeterminateProperty = DependencyProperty.Register(
        nameof(IsIndeterminate), typeof(bool), typeof(WovenBand),
        new FrameworkPropertyMetadata(false, (d, _) => ((WovenBand)d).UpdateTicking()));

    /// <summary>Woven share, 0 to 1.</summary>
    public double Value
    {
        get => (double)GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    /// <summary>Work of unknown length: a short woven stretch travels along the warp.</summary>
    public bool IsIndeterminate
    {
        get => (bool)GetValue(IsIndeterminateProperty);
        set => SetValue(IsIndeterminateProperty, value);
    }

    private Drawing? _woven;
    private Drawing? _warp;
    private double _builtWidth;
    private bool _ticking;
    private readonly DateTime _start = DateTime.Now;

    public WovenBand()
    {
        IsVisibleChanged += (_, _) => UpdateTicking();
        Unloaded += (_, _) => StopTicking();
    }

    private void UpdateTicking()
    {
        if (IsIndeterminate && IsVisible && SystemParameters.ClientAreaAnimation)
        {
            if (_ticking) return;
            _ticking = true;
            CompositionTarget.Rendering += OnFrame;
        }
        else StopTicking();
        InvalidateVisual();
    }

    private void StopTicking()
    {
        if (!_ticking) return;
        _ticking = false;
        CompositionTarget.Rendering -= OnFrame;
    }

    private void OnFrame(object? sender, EventArgs e) => InvalidateVisual();

    protected override void OnRender(DrawingContext dc)
    {
        var w = ActualWidth;
        var h = ActualHeight;
        if (w <= 0 || h <= 0) return;
        if (_woven is null || _builtWidth != w) Build(w, h);

        dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(0x15, 0x1A, 0x25)), null, new Rect(0, 0, w, h));
        dc.DrawDrawing(_warp);

        double from, to;
        if (IsIndeterminate)
        {
            // A stretch a fifth of the band long, sliding and wrapping.
            var span = w * 0.2;
            var t = SystemParameters.ClientAreaAnimation ? (DateTime.Now - _start).TotalSeconds : 0;
            from = (t * w * 0.35) % (w + span) - span;
            to = from + span;
        }
        else
        {
            from = 0;
            to = Math.Round(Math.Clamp(Value, 0, 1) * w / PickWidth) * PickWidth;
        }
        if (to <= from) return;

        dc.PushClip(new RectangleGeometry(new Rect(Math.Max(0, from), 0, Math.Max(0, to - Math.Max(0, from)), h)));
        dc.DrawDrawing(_woven);
        dc.Pop();

        // The beater: a pale line at the weaving edge while work is under way.
        if (to < w && (IsIndeterminate || Value < 1))
            dc.DrawRectangle(new SolidColorBrush(Color.FromArgb(0xCC, 0xEA, 0xE4, 0xD6)), null, new Rect(Math.Max(0, to - 1), 0, 2, h));
    }

    private void Build(double w, double h)
    {
        _builtWidth = w;
        var rowH = h / Rows;
        var picks = (int)Math.Ceiling(w / PickWidth);

        // One geometry per colour keeps this to a handful of draw calls.
        var byColor = new Dictionary<Color, StreamGeometry>();
        var contexts = new Dictionary<Color, StreamGeometryContext>();
        StreamGeometryContext For(Color c)
        {
            if (contexts.TryGetValue(c, out var ctx)) return ctx;
            var g = new StreamGeometry();
            byColor[c] = g;
            return contexts[c] = g.Open();
        }

        for (var p = 0; p < picks; p++)
        {
            var x = p * PickWidth;
            for (var r = 0; r < Rows; r++)
            {
                var y = r * rowH;
                // Upper half twists one way, lower half the other: the chevron of tablet weaving.
                var lean = r < Rows / 2 ? 1.0 : -1.0;
                var inset = 0.6;
                var ctx = For(ColorAt(p, r));
                var top = y + inset;
                var bottom = y + rowH - inset;
                var skew = PickWidth * 0.45 * lean;
                ctx.BeginFigure(new Point(x + (lean > 0 ? 0 : -skew), bottom), true, true);
                ctx.LineTo(new Point(x + (lean > 0 ? skew : 0), top), false, false);
                ctx.LineTo(new Point(x + PickWidth + (lean > 0 ? skew : 0) - 0.8, top), false, false);
                ctx.LineTo(new Point(x + PickWidth + (lean > 0 ? 0 : -skew) - 0.8, bottom), false, false);
            }
        }

        var woven = new DrawingGroup();
        foreach (var (c, ctx) in contexts) ctx.Close();
        foreach (var (c, g) in byColor)
        {
            g.Freeze();
            woven.Children.Add(new GeometryDrawing(new SolidColorBrush(c), null, g));
        }
        woven.Freeze();
        _woven = woven;

        var warp = new DrawingGroup();
        for (var r = 0; r < Rows; r++)
        {
            var c = ColorAt(0, r);
            warp.Children.Add(new GeometryDrawing(
                new SolidColorBrush(Color.FromArgb(0x80, c.R, c.G, c.B)), null,
                new RectangleGeometry(new Rect(0, r * rowH + rowH / 2 - 0.5, w, 1))));
        }
        warp.Freeze();
        _warp = warp;
    }

    /// <summary>
    /// Deep woad edge cords and a weld line, then a madder ground carrying diamonds:
    /// a wool ring, a woad ring and a weld heart.
    /// </summary>
    private static Color ColorAt(int pick, int row)
    {
        if (row == 0 || row == Rows - 1) return WoadDeep;
        if (row == 1 || row == Rows - 2) return Weld;
        const int inner = Rows - 4;
        var dr = Math.Abs(row - 2 - (inner - 1) / 2.0) - 0.5;          // 0 .. 3
        var dp = Math.Abs(pick % Period - Period / 2.0) / 2.25;         // 0 .. 4
        var d = dp + dr;
        if (d < 1) return Weld;
        if (d < 2) return Woad;
        if (d < 3) return Wool;
        return Madder;
    }
}
