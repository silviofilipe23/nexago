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
    expect(leagueCompletedStagesLabel(league, tournaments), 'APÓS 1 DE 6');
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
    expect(categoryForGender(categories, TournamentGenderCat.m)?.id, 'm');
    expect(categoryForGender(categories, TournamentGenderCat.f)?.id, 'f');
  });

  test(
    'categoriesForGender returns every exact genderType match, in order',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['m1', 'm2']);
    },
  );

  test(
    'categoriesForGender falls back to name matching when genderType is '
    'missing',
    () {
      const categories = [
        DiscoveryLeagueCategory(id: 'p1', name: 'Masculino Open'),
        DiscoveryLeagueCategory(id: 'p2', name: 'Masculino Intermediário'),
        DiscoveryLeagueCategory(id: 'p3', name: 'Feminino Open'),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['p1', 'p2']);
    },
  );

  test(
    'categoriesForGender falls back to the first category when nothing '
    'matches the gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'only',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['only']);
    },
  );

  test('categoriesForGender returns empty for an empty category list', () {
    expect(categoriesForGender(const [], TournamentGenderCat.m), isEmpty);
  });

  test(
    'categoriesForGender.first always matches categoryForGender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      for (final gender in TournamentGenderCat.values) {
        expect(
          categoriesForGender(categories, gender).first.id,
          categoryForGender(categories, gender)?.id,
        );
      }
    },
  );

  test(
    'resolveSelectedCategoryId keeps the selection when it still belongs '
    'to the gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, 'm2'),
        'm2',
      );
    },
  );

  test(
    'resolveSelectedCategoryId resets to the first option when the '
    'selection belonged to a different gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      // 'f1' estava selecionado no chip Feminino; usuário trocou pro
      // Masculino — a seleção antiga não é válida ali.
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, 'f1'),
        'm1',
      );
    },
  );

  test(
    'resolveSelectedCategoryId defaults to the first option when nothing '
    'is selected yet',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, null),
        'm1',
      );
    },
  );

  test(
    'resolveSelectedCategoryId falls back to the first category when '
    'gender is null, and to null when there are no categories',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
      ];
      expect(resolveSelectedCategoryId(categories, null, null), 'm1');
      expect(resolveSelectedCategoryId(const [], null, null), null);
    },
  );
}
