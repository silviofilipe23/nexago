import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexago_app/features/organizer/data/league_create_local_store.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/league_create/league_create_session.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';

void main() {
  group('LeagueCreateLocalStore', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('nexago_league_wizard_');
      SharedPreferences.setMockInitialValues({});
    });

    tearDown(() async {
      if (tempDir.existsSync()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('roundtrips session json', () async {
      final store = await LeagueCreateLocalStore.create();
      final session = LeagueCreateSession(
        draft: LeagueCreateDraft(
          name: 'Copa Goiás Beach',
          organizationName: 'NexaGO',
          seasonStartAt: DateTime(2026, 2, 1),
          seasonEndAt: DateTime(2026, 10, 1),
          categories: const [
            TournamentCategoryDraft(id: 'cat-1', name: 'Masc Open', spots: 16),
          ],
          stages: const [
            LeagueStageDraft(
              id: 's1',
              name: 'Etapa 1',
              order: 1,
              status: LeagueStageStatus.pending,
            ),
          ],
        ),
        currentStep: LeagueCreateStep.season,
        updatedAt: DateTime(2026, 3, 1, 12),
        managerUid: 'manager-1',
      );

      await store.save(session);
      final restored = await store.load('manager-1');

      expect(restored, isNotNull);
      expect(restored!.managerUid, 'manager-1');
      expect(restored.currentStep, LeagueCreateStep.season);
      expect(restored.draft.name, 'Copa Goiás Beach');
      expect(restored.draft.stages, hasLength(1));
    });

    test('clears missing cover path on restore', () async {
      final store = await LeagueCreateLocalStore.create();
      final missingCover = '${tempDir.path}/missing-cover.jpg';

      final session = LeagueCreateSession(
        draft: LeagueCreateDraft(
          name: 'Com capa',
          coverImagePath: missingCover,
        ),
        currentStep: LeagueCreateStep.identity,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);
      final restored = await store.load('manager-1');

      expect(restored, isNotNull);
      expect(restored!.draft.coverImagePath, isNull);
    });

    test('clear removes saved session', () async {
      final store = await LeagueCreateLocalStore.create();
      final session = LeagueCreateSession(
        draft: const LeagueCreateDraft(name: 'Copa'),
        currentStep: LeagueCreateStep.identity,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);
      await store.clear('manager-1');
      expect(await store.load('manager-1'), isNull);
    });
  });
}
