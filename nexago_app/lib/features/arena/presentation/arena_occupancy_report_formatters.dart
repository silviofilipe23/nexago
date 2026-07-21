/// Formata horas reservadas (fracionárias) para exibição compacta.
/// Ex.: `0` → `0h`, `2` → `2h`, `2.5` → `2,5h`.
String formatOccupancyHours(double hours) {
  if (hours <= 0) return '0h';
  final rounded = (hours * 10).round() / 10;
  if (rounded == rounded.roundToDouble()) {
    return '${rounded.toInt()}h';
  }
  return '${rounded.toStringAsFixed(1).replaceAll('.', ',')}h';
}

/// [count] jogadores únicos.
String formatOccupancyUniqueAthletes(int count) {
  return count == 1 ? '1 jogador' : '$count jogadores';
}

/// [percent] entre 0 e 100 — mesma regra de arredondamento do painel
/// (`formatDashboardOccupancyPercent`), duplicada aqui para não acoplar a
/// tela de Relatórios ao módulo do Dashboard.
String formatOccupancyPercent(double percent) {
  final p = percent.clamp(0, 100);
  final rounded = p.roundToDouble();
  if ((p - rounded).abs() < 0.0001) {
    return '${rounded.toInt()}%';
  }
  return '${p.toStringAsFixed(1).replaceAll('.', ',')}%';
}
