using System.Globalization;
using System.Windows.Data;

namespace SkyrimOnlineTR.Launcher;

/// <summary>Turns an item index into the number a reader expects (0 → "1").</summary>
public sealed class OneBased : IValueConverter
{
    public static readonly OneBased Instance = new();

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is int i ? (i + 1).ToString(culture) : "";

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
