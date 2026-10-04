import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexago_app/features/organizer/data/league_stage_create_local_store.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_stage_create/league_stage_create_session.dart';

void main() {
  group('LeagueStageCreateLocalStore', () {
    test('sessão de etapa preserva sportRaw no json', () async {
      final session = LeagueStageCreateSession(
        draft: LeagueStageCreateDraft(
          leagueId: 'league-1',
          leagueName: 'Liga BT',
          sportRaw: 'beachTennis',
          stage:
              const LeagueStageDraft(id: 'stage-1', name: 'Etapa 1', order: 1),
        ),
        currentStep: LeagueStageCreateStep.categoriesRegistration,
        updatedAt: DateTime(2026, 3, 1, 12),
        managerUid: 'manager-1',
      );
      final restored = LeagueStageCreateSession.fromJson(session.toJson())!;
      expect(restored.draft.sportRaw, 'beachTennis');
      expect(restored.draft.sportFirestoreValue, 'beachTennis');
    });

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
    });

    test('roundtrips session json per league', () async {
      final store = await LeagueStageCreateLocalStore.create();
      final session = LeagueStageCreateSession(
        draft: LeagueStageCreateDraft(
          leagueId: 'league-1',
          leagueName: 'Circuito Verão',
          stage: const LeagueStageDraft(
            id: 'stage-2',
            name: 'Etapa 2',
            order: 2,
            locationName: 'Arena nexaGO',
            city: 'Goiânia',
          ),
          categories: const [
            LeagueStageCategoryDraft(
              categoryId: 'c1',
              name: 'Masc Open',
              spots: 16,
            ),
          ],
        ),
        currentStep: LeagueStageCreateStep.categoriesRegistration,
        updatedAt: DateTime(2026, 3, 1, 12),
        managerUid: 'manager-1',
      );

      await store.save(session);
      final restored = await store.load('manager-1', 'league-1');

      expect(restored, isNotNull);
      expect(restored!.managerUid, 'manager-1');
      expect(
        restored.currentStep,
        LeagueStageCreateStep.categoriesRegistration,
      );
      expect(restored.draft.leagueName, 'Circuito Verão');
      expect(restored.draft.stage.name, 'Etapa 2');
    });

    test('findAnyLeagueIdWithDraft returns league id', () async {
      final store = await LeagueStageCreateLocalStore.create();
      final session = LeagueStageCreateSession(
        draft: const LeagueStageCreateDraft(
          leagueId: 'league-xyz',
          leagueName: 'Copa',
        ),
        currentStep: LeagueStageCreateStep.location,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);

      expect(await store.findAnyLeagueIdWithDraft('manager-1'), 'league-xyz');
    });

    test('clear removes stored session', () async {
      final store = await LeagueStageCreateLocalStore.create();
      final session = LeagueStageCreateSession(
        draft: const LeagueStageCreateDraft(leagueId: 'league-1'),
        currentStep: LeagueStageCreateStep.location,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);
      await store.clear('manager-1', 'league-1');

      expect(await store.load('manager-1', 'league-1'), isNull);
    });
  });
}
