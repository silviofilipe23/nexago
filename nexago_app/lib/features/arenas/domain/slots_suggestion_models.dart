import 'package:flutter/material.dart';

import 'arena_list_item.dart';
import 'arena_slot.dart';

enum SlotsSuggestionKind {
  alternateCourt,
  nextDay,
  nearbyArena,
}

enum SlotsSuggestionActionStyle {
  primaryFilled,
  outlined,
}

/// Sugestão exibida na tela de horários lotados.
class SlotsSuggestion {
  const SlotsSuggestion({
    required this.kind,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.actionStyle,
    required this.icon,
    required this.iconBackground,
    this.arenaId,
    this.courtId,
    this.date,
    this.startTime,
    this.endTime,
    this.priceReais,
    this.kmDistance,
    this.arena,
    this.slot,
    this.freeSlotsOnDay,
  });

  final SlotsSuggestionKind kind;
  final String title;
  final String subtitle;
  final String actionLabel;
  final SlotsSuggestionActionStyle actionStyle;
  final IconData icon;
  final Color iconBackground;

  final String? arenaId;
  final String? courtId;
  final DateTime? date;
  final String? startTime;
  final String? endTime;
  final double? priceReais;
  final double? kmDistance;
  final ArenaListItem? arena;
  final ArenaSlot? slot;
  final int? freeSlotsOnDay;
}
