import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'compete_hub_logic.dart';
import 'compete_hub_models.dart';
import 'tournament_discovery_models.dart';
import 'tournament_discovery_providers.dart';

final competeHubAthletesPreviewProvider =
    Provider.autoDispose<List<CompeteHubAthletePreview>>((ref) {
  return const [
    CompeteHubAthletePreview(
      name: 'João',
      categoryLabel: 'Cat B',
      initials: 'JO',
      avatarColor: Color(0xFF5B8DEF),
      isOnline: true,
    ),
    CompeteHubAthletePreview(
      name: 'Marcos',
      categoryLabel: 'Cat A',
      initials: 'MA',
      avatarColor: Color(0xFF2BD17E),
      isOnline: true,
    ),
    CompeteHubAthletePreview(
      name: 'Rafa',
      categoryLabel: 'Cat C',
      initials: 'RA',
      avatarColor: Color(0xFFFF6A1A),
    ),
    CompeteHubAthletePreview(
      name: 'Lucas',
      categoryLabel: 'Cat B',
      initials: 'LU',
      avatarColor: Color(0xFF7C6CFF),
    ),
    CompeteHubAthletePreview(
      name: 'Diego',
      categoryLabel: 'Cat A',
      initials: 'DI',
      avatarColor: Color(0xFFFF6B9D),
      isOnline: true,
    ),
  ];
});

final competeHubTeamPreviewProvider =
    Provider.autoDispose<CompeteHubTeamPreview>((ref) {
  return const CompeteHubTeamPreview(
    partnerName: 'Pedro Lima',
    categoryLabel: 'Masc B',
    monthsTogether: 14,
    winRatePercent: 72,
    wins: 20,
    losses: 8,
    partnerInitials: 'PL',
    partnerColor: Color(0xFF5B8DEF),
  );
});

final competeHubTournamentPreviewProvider =
    Provider.autoDispose<List<DiscoveryTournament>>((ref) {
  final tournaments = ref.watch(discoveryTournamentsProvider).valueOrNull ??
      const <DiscoveryTournament>[];
  return pickTournamentsForHubPreview(tournaments);
});
