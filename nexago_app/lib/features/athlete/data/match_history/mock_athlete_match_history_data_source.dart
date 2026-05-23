import '../../domain/match_history/athlete_match_history_models.dart';
import 'athlete_match_history_data_source.dart';
import 'mock_athlete_match_history_data.dart';

class MockAthleteMatchHistoryDataSource implements AthleteMatchHistoryDataSource {
  const MockAthleteMatchHistoryDataSource();

  @override
  Future<AthleteMatchHistoryBundle> fetchHistory(String uid) async {
    return mockAthleteMatchHistoryBundle();
  }
}
