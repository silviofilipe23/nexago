import 'package:flutter/material.dart';

import '../domain/athlete_quest/athlete_quest_models.dart';

AthleteBigQuest mockAthleteBigQuest() {
  final now = DateTime.now();
  var saturday = now;
  while (saturday.weekday != DateTime.saturday) {
    saturday = saturday.add(const Duration(days: 1));
  }
  final endsAt = DateTime(
    saturday.year,
    saturday.month,
    saturday.day,
    23,
    59,
  );

  return AthleteBigQuest(
    title: '5 jogos em arenas diferentes',
    goalCount: 5,
    completedCount: 2,
    segmentLabels: const ['CFC', 'ERREJOTA', '-', '-', '-'],
    endsAt: endsAt,
    rewardBadgeTitle: 'Escudo semanal',
    rewardBadgeIcon: Icons.shield_rounded,
  );
}

List<AthleteLeagueEntry> mockAthleteLeagueEntries({required int currentUserXp}) {
  return [
    const AthleteLeagueEntry(
      rank: 1,
      initials: 'BR',
      name: 'Bruno V.',
      xp: 420,
      avatarColor: Color(0xFF7C6CFF),
      isCurrentUser: false,
    ),
    const AthleteLeagueEntry(
      rank: 2,
      initials: 'CA',
      name: 'Camila S.',
      xp: 310,
      avatarColor: Color(0xFFFF6B9D),
      isCurrentUser: false,
    ),
    const AthleteLeagueEntry(
      rank: 3,
      initials: 'EN',
      name: 'Enzo R.',
      xp: 240,
      avatarColor: Color(0xFF2BD17E),
      isCurrentUser: false,
    ),
    AthleteLeagueEntry(
      rank: 4,
      initials: 'MA',
      name: 'Você',
      xp: currentUserXp,
      avatarColor: const Color(0xFFFF6A1A),
      isCurrentUser: true,
    ),
  ];
}
