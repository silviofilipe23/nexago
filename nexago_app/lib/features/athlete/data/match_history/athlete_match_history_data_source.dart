import '../../domain/match_history/athlete_match_history_models.dart';

/// Fonte de dados do histórico de partidas do atleta.
abstract interface class AthleteMatchHistoryDataSource {
  Future<AthleteMatchHistoryBundle> fetchHistory(String uid);
}
