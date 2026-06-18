import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_session.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

LeagueCreateSession _session() {
  return LeagueCreateSession(
    managerUid: 'mgr-1',
    currentStep: LeagueCreateStep.ranking,
    updatedAt: DateTime(2026, 1, 10, 9, 30),
    draft: const LeagueCreateDraft(
      name: 'Circuito Teste',
      countingStagesMode: LeagueCountingStagesMode.best3Of5,
      rankingPointsByPlace: {'1': 500, '2': 300},
      grandFinalSpots: 8,
      wildcardEnabled: true,
      wildcardSpots: 3,
      categories: [TournamentCategoryDraft(id: 'c1', spots: 16)],
      stages: [
        LeagueStageDraft(
          id: 's1',
          name: 'Etapa 1',
          order: 1,
          status: LeagueStageStatus.defined,
          tournamentIds: ['t1'],
        ),
        LeagueStageDraft(
          id: 'gf',
          name: 'Grande Final',
          order: 2,
          isGrandFinal: true,
        ),
      ],
    ),
  );
}

void main() {
  group('LeagueCreateSession round-trip', () {
    test('toJson/fromJson preserves core fields', () {
      final restored = LeagueCreateSession.fromJson(_session().toJson());

      expect(restored, isNotNull);
      expect(restored!.managerUid, 'mgr-1');
      expect(restored.currentStep, LeagueCreateStep.ranking);
      expect(restored.updatedAt, DateTime(2026, 1, 10, 9, 30));
      expect(restored.draft.name, 'Circuito Teste');
      expect(
        restored.draft.countingStagesMode,
        LeagueCountingStagesMode.best3Of5,
      );
      expect(restored.draft.rankingPointsByPlace, {'1': 500, '2': 300});
      expect(restored.draft.grandFinalSpots, 8);
      expect(restored.draft.wildcardEnabled, isTrue);
      expect(restored.draft.wildcardSpots, 3);
    });

    test('preserves stages with status and grand final flag', () {
      final restored = LeagueCreateSession.fromJson(_session().toJson());
      final stages = restored!.draft.stages;
      expect(stages, hasLength(2));
      expect(stages.first.status, LeagueStageStatus.defined);
      expect(stages.first.tournamentIds, ['t1']);
      expect(stages.last.isGrandFinal, isTrue);
    });

    test('toJson writes version 1', () {
      expect(_session().toJson()['version'], 1);
    });
  });

  Map<String, dynamic> baseJson({
    int? version = 1,
    Object? managerUid = 'mgr-1',
    Object? updatedAt,
    Object? currentStep = 'identity',
    Object? draft,
  }) {
    return {
      if (version != null) 'version': version,
      'managerUid': managerUid,
      'updatedAt': updatedAt ?? DateTime(2026, 1, 1).toIso8601String(),
      'currentStep': currentStep,
      'draft': draft ?? <String, dynamic>{'name': 'X'},
    };
  }

  group('LeagueCreateSession.fromJson validation', () {
    test('accepts version 1', () {
      expect(LeagueCreateSession.fromJson(baseJson(version: 1)), isNotNull);
    });

    test('rejects version 2 (league only supports v1)', () {
      expect(LeagueCreateSession.fromJson(baseJson(version: 2)), isNull);
    });

    test('rejects empty managerUid', () {
      expect(LeagueCreateSession.fromJson(baseJson(managerUid: '')), isNull);
    });

    test('rejects invalid updatedAt', () {
      expect(
        LeagueCreateSession.fromJson(baseJson(updatedAt: 'nope')),
        isNull,
      );
    });

    test('rejects unknown currentStep', () {
      expect(
        LeagueCreateSession.fromJson(baseJson(currentStep: 'bogus')),
        isNull,
      );
    });

    test('rejects draft that is not a map', () {
      expect(
        LeagueCreateSession.fromJson(baseJson(draft: 'oops')),
        isNull,
      );
    });
  });
}
