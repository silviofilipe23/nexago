import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/match_history/mock_athlete_match_detail_data.dart';
import 'athlete_match_detail_models.dart';

final athleteMatchDetailProvider = FutureProvider.autoDispose
    .family<AthleteMatchDetail?, String>((ref, matchId) async {
  await Future<void>.delayed(Duration.zero);
  return mockAthleteMatchDetail(matchId);
});
