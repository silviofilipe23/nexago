import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/match_history/mock_athlete_tournament_detail_data.dart';
import 'athlete_tournament_detail_models.dart';

final athleteTournamentDetailProvider = FutureProvider.autoDispose
    .family<AthleteTournamentDetail?, String>((ref, tournamentId) async {
  await Future<void>.delayed(Duration.zero);
  return mockAthleteTournamentDetail(tournamentId);
});
