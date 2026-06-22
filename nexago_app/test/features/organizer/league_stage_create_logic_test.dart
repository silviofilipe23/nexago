import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

LeagueStageCreateDraft _validDraft() {
  return LeagueStageCreateDraft(
    leagueId: 'league-1',
    leagueName: 'Circuito Verão',
    plannedStagesCount: 6,
    stage: LeagueStageDraft(
      id: 'stage-2',
      name: 'Etapa 2',
      order: 2,
      locationName: 'Arena nexaGO',
      city: 'Goiânia',
      startAt: DateTime(2026, 4, 10),
      endAt: DateTime(2026, 4, 12),
    ),
    categories: const [
      LeagueStageCategoryDraft(
        categoryId: 'c1',
        name: 'Masc Open',
        enabled: true,
        spots: 16,
      ),
    ],
    courtsCount: 4,
    registrationOpensAt: DateTime(2026, 3, 1),
    registrationClosesAt: DateTime(2026, 4, 1),
  );
}

void main() {
  group('resolveTargetStage', () {
    test('reuses first pending slot without tournaments', () {
      const stages = [
        LeagueStageDraft(
          id: 'stage-1',
          name: 'Etapa 1',
          order: 1,
          status: LeagueStageStatus.defined,
          tournamentIds: ['t1'],
        ),
        LeagueStageDraft(
          id: 'stage-2',
          name: 'Etapa 2',
          order: 2,
          status: LeagueStageStatus.pending,
        ),
        LeagueStageDraft(
          id: 'stage-3',
          name: 'Etapa 3',
          order: 3,
          status: LeagueStageStatus.pending,
        ),
      ];

      final target = resolveTargetStage(stages);

      expect(target.id, 'stage-2');
      expect(target.order, 2);
    });

    test('appends new stage when no pending slot is free', () {
      const stages = [
        LeagueStageDraft(
          id: 'stage-1',
          name: 'Etapa 1',
          order: 1,
          status: LeagueStageStatus.defined,
          tournamentIds: ['t1'],
        ),
        LeagueStageDraft(
          id: 'stage-2',
          name: 'Etapa 2',
          order: 2,
          status: LeagueStageStatus.pending,
          tournamentIds: ['t2'],
        ),
      ];

      final target = resolveTargetStage(stages);

      expect(target.id, 'stage-3');
      expect(target.order, 3);
      expect(target.name, 'Etapa 3');
      expect(target.status, LeagueStageStatus.pending);
    });

    test('creates stage 1 when there are no stages', () {
      final target = resolveTargetStage(const []);
      expect(target.id, 'stage-1');
      expect(target.order, 1);
    });

    test('ignores grand final when computing next order', () {
      // Só a Grande Final existe, já definida → não é reaproveitada e é
      // ignorada no maxOrder, então a nova etapa recebe order 1.
      const stages = [
        LeagueStageDraft(
          id: 'gf',
          name: 'Grande Final',
          order: 10,
          status: LeagueStageStatus.defined,
          isGrandFinal: true,
          tournamentIds: ['t-gf'],
        ),
      ];
      final target = resolveTargetStage(stages);
      expect(target.order, 1);
      expect(target.isGrandFinal, isFalse);
    });
  });

  group('defaultStageName / stageOrderHint', () {
    test('defaultStageName falls back by type', () {
      expect(
        defaultStageName(
          const LeagueStageDraft(id: 's', name: 'Etapa Sul', order: 2),
        ),
        'Etapa Sul',
      );
      expect(
        defaultStageName(const LeagueStageDraft(id: 's', order: 3)),
        'Etapa 3',
      );
      expect(
        defaultStageName(
          const LeagueStageDraft(id: 'gf', order: 7, isGrandFinal: true),
        ),
        'Grande Final',
      );
    });

    test('stageOrderHint distinguishes grand final', () {
      expect(
        stageOrderHint(
          _validDraft().copyWith(
            stage: const LeagueStageDraft(id: 's', order: 3),
          ),
        ),
        'Etapa 3 da temporada.',
      );
      expect(
        stageOrderHint(
          _validDraft().copyWith(
            stage: const LeagueStageDraft(
              id: 'gf',
              order: 7,
              isGrandFinal: true,
            ),
          ),
        ),
        'Grande Final da temporada.',
      );
    });
  });

  group('categoriesFromLeagueCategories', () {
    test('parses maps, ignores empty ids and applies price fallback', () {
      final categories = categoriesFromLeagueCategories([
        {
          'id': 'c1',
          'categoryName': 'Masc Open',
          'maxTeams': 12,
          'entryFeeCents': 7000,
          'bracketFormat': 'double_elimination',
        },
        {'id': '', 'name': 'Ignorada'},
        {'name': 'Sem id'},
        {'id': 'c2', 'name': 'Fem Open'},
      ], 9000);

      expect(categories, hasLength(2));
      final first = categories.first;
      expect(first.categoryId, 'c1');
      expect(first.name, 'Masc Open');
      expect(first.spots, 12);
      expect(first.priceCents, 7000);
      expect(first.bracketSystem, TournamentBracketSystem.doubleElimination);
      expect(first.enabled, isTrue);

      final second = categories.last;
      expect(second.priceCents, 9000); // fallback da liga
      expect(second.bracketSystem, TournamentBracketSystem.groupsThenKnockout);
    });
  });

  group('stagesFromLeagueData', () {
    test('returns empty for null', () {
      expect(stagesFromLeagueData(null), isEmpty);
    });

    test('parses defined status and filters empty tournament ids', () {
      final stages = stagesFromLeagueData([
        {
          'id': 's1',
          'name': 'Etapa 1',
          'order': 1,
          'status': 'defined',
          'tournamentIds': ['t1', '', 't2'],
        },
        {'id': '', 'name': 'sem id'},
        {'id': 'gf', 'order': 2, 'status': 'pending', 'isGrandFinal': true},
      ]);

      expect(stages, hasLength(2));
      expect(stages.first.status, LeagueStageStatus.defined);
      expect(stages.first.tournamentIds, ['t1', 't2']);
      expect(stages.last.isGrandFinal, isTrue);
      expect(stages.last.status, LeagueStageStatus.pending);
    });
  });

  group('canContinueFromStageStep', () {
    test('location requires name, city, venue and dates', () {
      const draft = LeagueStageCreateDraft();
      expect(
        canContinueFromStageStep(draft, LeagueStageCreateStep.location),
        isFalse,
      );

      expect(
        canContinueFromStageStep(_validDraft(), LeagueStageCreateStep.location),
        isTrue,
      );
    });

    test('location rejects zero courts and end before start', () {
      expect(
        canContinueFromStageStep(
          _validDraft().copyWith(courtsCount: 0),
          LeagueStageCreateStep.location,
        ),
        isFalse,
      );

      expect(
        canContinueFromStageStep(
          _validDraft().copyWith(
            stage: _validDraft().stage.copyWith(
              startAt: DateTime(2026, 4, 12),
              endAt: DateTime(2026, 4, 10),
            ),
          ),
          LeagueStageCreateStep.location,
        ),
        isFalse,
      );
    });

    test(
      'categories step requires enabled category and registration range',
      () {
        final draft = _validDraft().copyWith(
          categories: const [
            LeagueStageCategoryDraft(
              categoryId: 'c1',
              name: 'Masc Open',
              enabled: false,
              spots: 16,
            ),
          ],
        );
        expect(
          canContinueFromStageStep(
            draft,
            LeagueStageCreateStep.categoriesRegistration,
          ),
          isFalse,
        );

        expect(
          canContinueFromStageStep(
            _validDraft(),
            LeagueStageCreateStep.categoriesRegistration,
          ),
          isTrue,
        );
      },
    );

    test('review requires all previous steps valid', () {
      expect(
        canContinueFromStageStep(_validDraft(), LeagueStageCreateStep.review),
        isTrue,
      );
      expect(isValidStageForPublish(_validDraft()), isTrue);
    });
  });

  group('review summaries', () {
    test('formats league, location and categories summaries', () {
      final draft = _validDraft();

      expect(reviewStageLeagueSummary(draft), 'Circuito Verão · Etapa 2 de 6');
      expect(reviewStageCategoriesSummary(draft), 'Masc Open · 16 vagas');
    });
  });
}
