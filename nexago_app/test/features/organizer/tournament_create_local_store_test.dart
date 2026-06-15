import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexago_app/features/organizer/data/tournament_create_local_store.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_session.dart';

void main() {
  group('TournamentCreateLocalStore', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('nexago_wizard_store_');
      SharedPreferences.setMockInitialValues({});
    });

    tearDown(() async {
      if (tempDir.existsSync()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('roundtrips session json', () async {
      final store = await TournamentCreateLocalStore.create();
      final session = TournamentCreateSession(
        draft: const TournamentCreateDraft(
          name: 'Open Goiânia',
          city: 'Goiânia',
          categories: [
            TournamentCategoryDraft(id: 'cat-1', name: 'Masc Open', spots: 16),
          ],
        ),
        currentStep: TournamentCreateStep.location,
        updatedAt: DateTime(2026, 3, 1, 12),
        managerUid: 'manager-1',
      );

      await store.save(session);
      final restored = await store.load('manager-1');

      expect(restored, isNotNull);
      expect(restored!.managerUid, 'manager-1');
      expect(restored.currentStep, TournamentCreateStep.location);
      expect(restored.draft.name, 'Open Goiânia');
      expect(restored.draft.categories, hasLength(1));
    });

    test('rejects session saved for another uid', () async {
      final store = await TournamentCreateLocalStore.create();
      final session = TournamentCreateSession(
        draft: const TournamentCreateDraft(name: 'Outro usuário'),
        currentStep: TournamentCreateStep.identity,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'owner-a',
      );

      await store.save(session);
      expect(await store.load('owner-b'), isNull);
    });

    test('clears missing local file paths on restore', () async {
      final store = await TournamentCreateLocalStore.create();
      final missingCover = '${tempDir.path}/missing-cover.jpg';
      final missingPdf = '${tempDir.path}/missing.pdf';

      final session = TournamentCreateSession(
        draft: TournamentCreateDraft(
          name: 'Com anexos',
          coverImagePath: missingCover,
          regulationPdfPath: missingPdf,
        ),
        currentStep: TournamentCreateStep.identity,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);
      final restored = await store.load('manager-1');

      expect(restored, isNotNull);
      expect(restored!.draft.coverImagePath, isNull);
      expect(restored.draft.regulationPdfPath, isNull);
    });

    test('clear removes persisted session', () async {
      final store = await TournamentCreateLocalStore.create();
      final session = TournamentCreateSession(
        draft: const TournamentCreateDraft(name: 'Temp'),
        currentStep: TournamentCreateStep.identity,
        updatedAt: DateTime(2026, 3, 1),
        managerUid: 'manager-1',
      );

      await store.save(session);
      await store.clear('manager-1');
      expect(await store.load('manager-1'), isNull);
    });
  });
}
