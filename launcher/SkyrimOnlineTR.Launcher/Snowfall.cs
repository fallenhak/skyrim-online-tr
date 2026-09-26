using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace SkyrimOnlineTR.Launcher;

/// <summary>Slow drifting snow on a Canvas, driven by the render loop.</summary>
public sealed class Snowfall
{
    private sealed class Flake
    {
        public required Ellipse Shape;
        public double X, Y, Speed, Drift, Phase;
    }

    private readonly Canvas _canvas;
    private readonly List<Flake> _flakes = [];
    private readonly Random _random = new();
    private TimeSpan _last;

    public Snowfall(Canvas canvas, int count = 90)
    {
        _canvas = canvas;
        for (var i = 0; i < count; i++) _flakes.Add(Create(initial: true));
        CompositionTarget.Rendering += OnRendering;
    }

    private Flake Create(bool initial)
    {
        var size = 1.2 + _random.NextDouble() * 2.8;
        var shape = new Ellipse
        {
            Width = size,
            Height = size,
            Fill = new SolidColorBrush(Color.FromArgb((byte)(70 + _random.Next(120)), 235, 240, 248)),
        };
        if (size > 3.2) shape.Effect = new System.Windows.Media.Effects.BlurEffect { Radius = 1.5 };
        _canvas.Children.Add(shape);
        var width = Math.Max(_canvas.ActualWidth, 1080);
        var height = Math.Max(_canvas.ActualHeight, 640);
        return new Flake
        {
            Shape = shape,
            X = _random.NextDouble() * width,
            Y = initial ? _random.NextDouble() * height : -10,
            Speed = 12 + size * 9 + _random.NextDouble() * 10,
            Drift = 6 + _random.NextDouble() * 14,
            Phase = _random.NextDouble() * Math.PI * 2,
        };
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        var now = ((RenderingEventArgs)e).RenderingTime;
        var dt = _last == TimeSpan.Zero ? 0 : Math.Min((now - _last).TotalSeconds, 0.1);
        _last = now;
        var height = Math.Max(_canvas.ActualHeight, 640);
        var width = Math.Max(_canvas.ActualWidth, 1080);

        foreach (var f in _flakes)
        {
            f.Y += f.Speed * dt;
            f.Phase += dt * 0.8;
            if (f.Y > height + 10)
            {
                f.Y = -10;
                f.X = _random.NextDouble() * width;
            }
            Canvas.SetLeft(f.Shape, f.X + Math.Sin(f.Phase) * f.Drift);
            Canvas.SetTop(f.Shape, f.Y);
        }
    }

    public void Stop() => CompositionTarget.Rendering -= OnRendering;
}
