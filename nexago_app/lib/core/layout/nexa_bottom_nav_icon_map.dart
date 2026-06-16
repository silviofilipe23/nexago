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
    _ => null,
  };
}
