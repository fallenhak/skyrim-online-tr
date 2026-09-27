using System.Globalization;
using System.Windows.Data;

namespace SkyrimOnlineTR.Launcher;

/// <summary>Feed dates arrive as 2026-09-27; players read 27 Eylül 2026.</summary>
public sealed class TrDate : IValueConverter
{
    public static readonly TrDate Instance = new();
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is string s && DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("d MMMM yyyy", Tr)
            : value ?? "";

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
