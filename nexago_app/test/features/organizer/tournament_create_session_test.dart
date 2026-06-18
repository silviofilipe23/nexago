import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_session.dart';

TournamentCreateSession _session() {
  return TournamentCreateSession(
    managerUid: 'mgr-1',
    currentStep: TournamentCreateStep.categories,
    updatedAt: DateTime(2026, 1, 10, 9, 30),
    draft: const TournamentCreateDraft(
      name: 'Copa Teste',
      city: 'Goiânia',
      categories: [
        TournamentCategoryDraft(
          id: 'c1',
          name: 'Open',
          bracketSystem: TournamentBracketSystem.doubleElimination,
          prizes: [
            TournamentCategoryPrizeDraft(
              position: '1',
              valueCents: 50000,
              label: 'Campeão',
            ),
          ],
        ),
      ],
    ),
  );
}

void main() {
  group('TournamentCreateSession round-trip', () {
    test('toJson/fromJson preserves core fields', () {
      final json = _session().toJson();
      final restored = TournamentCreateSession.fromJson(json);

      expect(restored, isNotNull);
      expect(restored!.managerUid, 'mgr-1');
      expect(restored.currentStep, TournamentCreateStep.categories);
      expect(restored.updatedAt, DateTime(2026, 1, 10, 9, 30));
      expect(restored.draft.name, 'Copa Teste');
      expect(restored.draft.categories, hasLength(1));
      expect(
        restored.draft.categories.first.bracketSystem,
        TournamentBracketSystem.doubleElimination,
      );
      expect(restored.draft.categories.first.prizes.first.valueCents, 50000);
    });

    test('toJson writes version 2', () {
      expect(_session().toJson()['version'], 2);
    });
  });

  Map<String, dynamic> baseJson({
    int? version = 2,
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

  group('TournamentCreateSession.fromJson validation', () {
    test('accepts missing version (defaults to 1)', () {
      final json = baseJson(version: null);
      expect(TournamentCreateSession.fromJson(json), isNotNull);
    });

    test('rejects unsupported version 3', () {
      expect(TournamentCreateSession.fromJson(baseJson(version: 3)), isNull);
    });

    test('rejects empty managerUid', () {
      expect(
        TournamentCreateSession.fromJson(baseJson(managerUid: '')),
        isNull,
      );
    });

    test('rejects invalid/missing updatedAt', () {
      expect(
        TournamentCreateSession.fromJson(baseJson(updatedAt: 'not-a-date')),
        isNull,
      );
    });

    test('rejects unknown currentStep', () {
      expect(
        TournamentCreateSession.fromJson(baseJson(currentStep: 'bogus')),
        isNull,
      );
    });

    test('maps legacy "format" step to categories', () {
      final restored = TournamentCreateSession.fromJson(
        baseJson(currentStep: 'format'),
      );
      expect(restored?.currentStep, TournamentCreateStep.categories);
    });

    test('maps legacy "prizes" step to rules', () {
      final restored = TournamentCreateSession.fromJson(
        baseJson(currentStep: 'prizes'),
      );
      expect(restored?.currentStep, TournamentCreateStep.rules);
    });

    test('rejects draft that is not a map', () {
      expect(
        TournamentCreateSession.fromJson(baseJson(draft: <dynamic>['x'])),
        isNull,
      );
    });
  });

  group('TournamentCreateSession version 1 migration', () {
    test('category without bracket inherits draft-level legacy bracket', () {
      final json = baseJson(
        version: 1,
        draft: <String, dynamic>{
          'name': 'Legado',
          'bracketSystem': 'doubleElimination',
          'categories': <Map<String, dynamic>>[
            {'id': 'c1'},
          ],
        },
      );

      final restored = TournamentCreateSession.fromJson(json);
      expect(restored, isNotNull);
      expect(
        restored!.draft.categories.first.bracketSystem,
        TournamentBracketSystem.doubleElimination,
      );
    });

    test('version 2 category without bracket falls back to groupsThenKnockout',
        () {
      final json = baseJson(
        version: 2,
        draft: <String, dynamic>{
          'name': 'Novo',
          'categories': <Map<String, dynamic>>[
            {'id': 'c1'},
          ],
        },
      );

      final restored = TournamentCreateSession.fromJson(json);
      expect(
        restored!.draft.categories.first.bracketSystem,
        TournamentBracketSystem.groupsThenKnockout,
      );
    });
  });
}
