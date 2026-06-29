import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/league_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryLeague _league({
  List<DiscoveryLeagueStage> stages = const [],
  int? plannedStagesCount,
  bool grandFinalEnabled = true,
  int grandFinalSpots = 16,
  DateTime? seasonEndAt,
}) {
  return DiscoveryLeague(
    id: 'l1',
    name: 'nexaGO League',
    stages: stages,
    plannedStagesCount: plannedStagesCount,
    grandFinalEnabled: grandFinalEnabled,
    grandFinalSpots: grandFinalSpots,
    seasonStartAt: DateTime(2026, 6, 1),
    seasonEndAt: seasonEndAt ?? DateTime(2026, 12, 15),
    countingStagesMode: LeaguePointsCountingMode.allStages,
  );
}

DiscoveryTournament _tournament({
  required String id,
  TournamentListingStatus status = TournamentListingStatus.open,
}) {
  return DiscoveryTournament(
    id: id,
    name: 'Torneio $id',
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: 'Jun 2026',
    startDate: DateTime(2026, 6, 1),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: 'R\$ 90',
    priceValue: 9000,
    spotsLeft: 10,
    spotsTotal: 64,
    status: status,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  test('leagueStagesBadgeLabel uses plannedStagesCount', () {
    final league = _league(plannedStagesCount: 6, stages: const []);
    expect(leagueStagesBadgeLabel(league), 'LIGA · 6 ETAPAS');
  });

  test('leagueSeasonDateLabel formats season range', () {
    final league = _league();
    expect(leagueSeasonDateLabel(league), contains('2026'));
    expect(leagueSeasonDateLabel(league), contains('–'));
  });

  test('leagueCompletedStagesLabel counts completed stage tournaments', () {
    final league = _league(
      plannedStagesCount: 6,
      stages: [
        DiscoveryLeagueStage(
          id: 's1',
          name: 'E1',
          order: 1,
          tournamentIds: ['t1'],
        ),
        DiscoveryLeagueStage(
          id: 's2',
          name: 'E2',
          order: 2,
          tournamentIds: ['t2'],
        ),
      ],
    );
    final tournaments = {
      't1': _tournament(id: 't1', status: TournamentListingStatus.completed),
      't2': _tournament(id: 't2', status: TournamentListingStatus.open),
    };
    expect(
      leagueCompletedStagesLabel(league, tournaments),
      'APÓS 1 DE 6',
    );
  });

  test('leagueGrandFinalBannerText respects spots and month', () {
    final league = _league(
      grandFinalSpots: 16,
      seasonEndAt: DateTime(2026, 12, 1),
    );
    final text = leagueGrandFinalBannerText(league);
    expect(text, isNotNull);
    expect(text!, contains('16'));
    expect(text, contains('duplas'));
    expect(text.toLowerCase(), contains('dezembro'));
  });

  test('categoryForGender resolves genderType', () {
    const categories = [
      DiscoveryLeagueCategory(id: 'm', name: 'Masculino', genderType: 'male'),
      DiscoveryLeagueCategory(id: 'f', name: 'Feminino', genderType: 'female'),
    ];
    expect(
      categoryForGender(categories, TournamentGenderCat.m)?.id,
      'm',
    );
    expect(
      categoryForGender(categories, TournamentGenderCat.f)?.id,
      'f',
    );
  });
}
