import 'package:intl/intl.dart';

String formatDashboardCurrency(double value) {
  return NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  ).format(value);
}

/// [percent] entre 0 e 100.
String formatDashboardOccupancyPercent(double percent) {
  final p = percent.clamp(0, 100);
  final rounded = p.roundToDouble();
  if ((p - rounded).abs() < 0.0001) {
    return '${rounded.toInt()}%';
  }
  return '${p.toStringAsFixed(1).replaceAll('.', ',')}%';
}

String formatDashboardPeakHour(int? hour) {
  if (hour == null) return '—';
  return '${hour}h';
}

/// Eixo Y do gráfico (valores compactos).
String formatDashboardChartAxis(double value) {
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}k'.replaceAll('.', ',');
  }
  if (value == value.roundToDouble()) {
    return value.toInt().toString();
  }
  return value.toStringAsFixed(0);
}
