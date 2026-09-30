import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart';

/// Faixa "até um nível" no editor de categoria do app (spec 2026-09-30).
void main() {
  late ProviderContainer container;

  const presets = 'category-level-preset-selector';
  const upTo = 'category-level-up-to-selector';
  const legacyHint =
      'Faixa personalizada (legado) — escolha um preset para alterar.';

  // Pumps controlados (<400ms de relógio) para o timer de persistência do
  // wizard nunca disparar dentro do teste (tocaria FirebaseAuth).
  Future<void> pumpSheet(
    WidgetTester tester, {
    TournamentCategoryDraft? existing,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Consumer(
            builder: (context, ref, _) {
              container = ProviderScope.containerOf(context);
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showTournamentCategoryEditorSheet(
                      context,
                      ref,
                      existing: existing,
                    ),
                    child: const Text('abrir'),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
    if (existing != null) {
      container
          .read(tournamentCreateWizardProvider.notifier)
          .addCategory(existing);
    }
    await tester.tap(find.text('abrir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Finder chip(String selectorKey, String label) => find.descendant(
        of: find.byKey(Key(selectorKey)),
        matching: find.text(label),
      );

  Future<void> tapVisible(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
  }

  Future<void> tearDownSheet(WidgetTester tester) async {
    // Limpa o timer de persistência antes do teardown.
    await tester.pumpWidget(const SizedBox());
  }

  testWidgets('categoria nova (Livre) não mostra a escada', (tester) async {
    await pumpSheet(tester);
    expect(find.byKey(const Key(upTo)), findsNothing);
    await tearDownSheet(tester);
  });

  testWidgets(
    '"Até um nível" + Intermediário 2 grava Iniciante 1 → Intermediário 2 com nome "até"',
    (tester) async {
      await pumpSheet(tester);
      await tapVisible(tester, chip(presets, 'Até um nível'));
      expect(find.byKey(const Key(upTo)), findsOneWidget);

      await tapVisible(tester, chip(upTo, 'Intermediário 2'));
      await tapVisible(tester, find.text('Salvar categoria'));
      await tester.pump(const Duration(milliseconds: 300));

      final saved =
          container.read(tournamentCreateDraftProvider).categories.single;
      expect(saved.minLevel, 'Iniciante 1');
      expect(saved.skillLevel, TournamentSkillLevel.intermediario2);
      expect(saved.name, 'Masculino até Intermediário 2');
      await tearDownSheet(tester);
    },
  );

  testWidgets('Open na escada não faz o chip pular para Livre', (tester) async {
    await pumpSheet(tester);
    await tapVisible(tester, chip(presets, 'Até um nível'));
    await tapVisible(tester, chip(upTo, 'Open'));
    expect(find.byKey(const Key(upTo)), findsOneWidget);
    expect(
      find.text('Libera todos os níveis (mesma regra do Livre).'),
      findsOneWidget,
    );
    await tearDownSheet(tester);
  });

  testWidgets('voltar a um preset fecha a escada', (tester) async {
    await pumpSheet(tester);
    await tapVisible(tester, chip(presets, 'Até um nível'));
    await tapVisible(tester, chip(presets, 'Intermediário'));
    expect(find.byKey(const Key(upTo)), findsNothing);
    await tearDownSheet(tester);
  });

  testWidgets('reabre categoria "até" gravada com a escada aberta',
      (tester) async {
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        minLevel: 'Iniciante 1',
        skillLevel: TournamentSkillLevel.avancado1,
      ),
    );
    expect(find.byKey(const Key(upTo)), findsOneWidget);
    expect(find.text(legacyHint), findsNothing);
    expect(
      find.text(
        'Libera de Iniciante 1 até Avançado 1. Quem está acima não se inscreve.',
      ),
      findsOneWidget,
    );
    await tearDownSheet(tester);
  });

  testWidgets('reaberta, Iniciante 2 na escada não faz o chip pular para Iniciante',
      (tester) async {
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        minLevel: 'Iniciante 1',
        skillLevel: TournamentSkillLevel.avancado1,
      ),
    );
    await tapVisible(tester, chip(upTo, 'Iniciante 2'));
    expect(find.byKey(const Key(upTo)), findsOneWidget);
    expect(
      find.text(
        'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se '
        'inscreve. Mesma regra do preset Iniciante.',
      ),
      findsOneWidget,
    );
    await tearDownSheet(tester);
  });

  testWidgets('no celular o teto marcado aparece sem rolar a escada', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        minLevel: 'Iniciante 1',
        skillLevel: TournamentSkillLevel.avancado2,
      ),
    );
    final selected = chip(upTo, 'Avançado 2');
    expect(selected, findsOneWidget);
    // Sem rolagem horizontal escondendo o nível marcado: os 7 degraus cabem
    // na largura do celular (390pt), quebrando linha como no portal.
    expect(tester.getRect(selected).right, lessThanOrEqualTo(390));
    await tearDownSheet(tester);
  });

  testWidgets('teto legado vira Open ao ativar "Até um nível"', (tester) async {
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        skillLevel: TournamentSkillLevel.beginner,
      ),
    );
    expect(find.text(legacyHint), findsOneWidget);

    await tapVisible(tester, chip(presets, 'Até um nível'));
    expect(
      find.text('Libera todos os níveis (mesma regra do Livre).'),
      findsOneWidget,
    );
    expect(find.text(legacyHint), findsNothing);
    await tearDownSheet(tester);
  });
}
