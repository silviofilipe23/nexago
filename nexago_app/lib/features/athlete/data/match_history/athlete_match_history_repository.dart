import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/match_history/athlete_match_history_models.dart';
import 'athlete_match_history_data_source.dart';
import 'mock_athlete_match_history_data_source.dart';

final athleteMatchHistoryRepositoryProvider =
    Provider<AthleteMatchHistoryRepository>((ref) {
  return AthleteMatchHistoryRepository(
    dataSource: const MockAthleteMatchHistoryDataSource(),
  );
});

class AthleteMatchHistoryRepository {
  AthleteMatchHistoryRepository({required AthleteMatchHistoryDataSource dataSource})
      : _dataSource = dataSource;

  final AthleteMatchHistoryDataSource _dataSource;

  Future<AthleteMatchHistoryBundle> fetchHistory(String uid) {
    return _dataSource.fetchHistory(uid);
  }
}
