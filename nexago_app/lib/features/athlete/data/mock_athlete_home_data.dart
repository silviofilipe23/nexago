import 'package:flutter/material.dart';

import '../domain/athlete_home_models.dart';

const mockHomeNotificationCount = 3;

List<AthleteHomeSlotPreview> mockAthleteHomeSlots() {
  return const [
    AthleteHomeSlotPreview(
      id: 'slot-1',
      arenaName: 'Arena CFC',
      courtLabel: 'Quadra 2',
      timeLabel: '20:30',
      priceLabel: 'R\$ 70',
      isPopular: true,
      tintColor: Color(0xFF0D1F14),
    ),
    AthleteHomeSlotPreview(
      id: 'slot-2',
      arenaName: 'ErreJota',
      courtLabel: 'Quadra 3',
      timeLabel: '21:00',
      priceLabel: 'R\$ 90',
      tintColor: Color(0xFF1A1408),
    ),
  ];
}

List<AthleteHomePlayPartner> mockAthleteHomePlayPartners() {
  return const [
    AthleteHomePlayPartner(
      initials: 'EN',
      name: 'Enzo R.',
      statusLabel: 'Procurando dupla · 19:42',
      avatarColor: Color(0xFF2BD17E),
      action: AthleteHomePartnerAction.call,
    ),
    AthleteHomePlayPartner(
      initials: 'BR',
      name: 'Bruno V.',
      statusLabel: 'Online · jogou ontem',
      avatarColor: Color(0xFF7C6CFF),
      action: AthleteHomePartnerAction.invite,
    ),
    AthleteHomePlayPartner(
      initials: 'CA',
      name: 'Camila S.',
      statusLabel: 'Online · 2 jogos com vc',
      avatarColor: Color(0xFFFF6B9D),
      action: AthleteHomePartnerAction.invite,
    ),
  ];
}

