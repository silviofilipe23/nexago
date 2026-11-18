import '../../../core/formatting/app_currency_format.dart';

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

/// Valor curto para frases do cockpit: "R$ 980", "R$ 9.870", "R$ 38,2 mil",
/// "R$ 1,2 mi". Usa espaço que não quebra: o valor nunca parte entre linhas.
String formatDashboardCompactCurrency(double value) {
  final abs = value.abs();
  if (abs < 10000) return formatBRLWhole(value);
  String one(double v) {
    final s = v.toStringAsFixed(1).replaceAll('.', ',');
    return s.endsWith(',0') ? s.substring(0, s.length - 2) : s;
  }

  const nbsp = '\u00a0';
  if (abs < 1000000) return 'R\$$nbsp${one(value / 1000)}${nbsp}mil';
  return 'R\$$nbsp${one(value / 1000000)}${nbsp}mi';
}
