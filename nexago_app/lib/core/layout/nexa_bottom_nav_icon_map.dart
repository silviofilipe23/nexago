import 'package:flutter/material.dart';

String? materialIconToSfSymbol(IconData icon) {
  return switch (icon) {
    Icons.home || Icons.home_outlined => 'house',
    Icons.home_rounded => 'house.fill',
    Icons.calendar_today ||
    Icons.calendar_today_outlined ||
    Icons.calendar_month_outlined ||
    Icons.calendar_month_rounded =>
      'calendar',
    Icons.add_circle ||
    Icons.add_circle_outline ||
    Icons.add_rounded =>
      'plus.circle',
    Icons.emoji_events ||
    Icons.emoji_events_outlined =>
      'trophy',
    Icons.diversity_3_outlined ||
    Icons.diversity_3_rounded =>
      'person.3',
    Icons.dashboard_outlined || Icons.dashboard_rounded => 'square.grid.2x2',
    Icons.receipt_long_outlined ||
    Icons.receipt_long_rounded =>
      'doc.text',
    Icons.event_available_outlined ||
    Icons.event_available_rounded =>
      'calendar.badge.clock',
    Icons.settings_outlined || Icons.settings_rounded => 'gearshape',
    Icons.settings => 'gearshape.fill',
    // Abas do Modo Focus. Um ícone fora deste mapa não degrada para "sem
    // símbolo" — a barra nativa cai no `iconData` e o desenha FORA DE ESCALA,
    // então quem adiciona aba nova precisa passar aqui (ou informar o
    // `sfSymbol` no próprio item).
    Icons.local_fire_department_outlined => 'flame',
    Icons.local_fire_department ||
    Icons.local_fire_department_rounded =>
      'flame.fill',
    Icons.emoji_events_rounded => 'trophy.fill',
    Icons.table_rows_outlined => 'tablecells',
    Icons.table_rows || Icons.table_rows_rounded => 'tablecells.fill',
    Icons.account_tree_outlined ||
    Icons.account_tree ||
    Icons.account_tree_rounded =>
      'arrow.triangle.branch',
    _ => null,
  };
}
