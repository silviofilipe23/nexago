import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../tournaments/domain/tournament_discovery_providers.dart';
import 'athlete_home_competitions_logic.dart';

final athleteHomeCompetitionsPreviewProvider =
    Provider.autoDispose<List<AthleteHomeCompetitionItem>>((ref) {
  final tournaments =
      ref.watch(discoveryTournamentsProvider).valueOrNull ?? const [];
  final leagues = ref.watch(discoveryLeaguesProvider).valueOrNull ?? const [];
  return pickAthleteHomeCompetitionsPreview(
    tournaments: tournaments,
    leagues: leagues,
    limit: 5,
  );
});
