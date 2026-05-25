import 'package:flutter/material.dart';

/// Preview de vaga disponível na home (mock v1).
class AthleteHomeSlotPreview {
  const AthleteHomeSlotPreview({
    required this.id,
    required this.arenaName,
    required this.courtLabel,
    required this.timeLabel,
    required this.priceLabel,
    this.isPopular = false,
    this.tintColor = const Color(0xFF0D1F14),
  });

  final String id;
  final String arenaName;
  final String courtLabel;
  final String timeLabel;
  final String priceLabel;
  final bool isPopular;
  final Color tintColor;
}

enum AthleteHomePartnerAction { call, invite }

/// Parceiro na seção "Joga com você" (mock v1).
class AthleteHomePlayPartner {
  const AthleteHomePlayPartner({
    required this.initials,
    required this.name,
    required this.statusLabel,
    required this.avatarColor,
    required this.action,
  });

  final String initials;
  final String name;
  final String statusLabel;
  final Color avatarColor;
  final AthleteHomePartnerAction action;
}
