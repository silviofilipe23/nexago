import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_mapper.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_sports_levels/athlete_sport_level_card.dart';

const _enrollment = AthleteSportEnrollment(
  appSportId: 'volei_praia',
  firestoreSportId: 'VOLEI_PRAIA',
  label: 'Vôlei de Praia',
  icon: Icons.sports_volleyball,
  isPrimary: true,
  levelLabel: 'Intermediário 1',
);

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets(
    'a 375pt de largura os 7 chips de nível mostram o rótulo completo',
    (tester) async {
      tester.view.physicalSize = const Size(375, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        _wrap(
          AthleteSportLevelCard(
            enrollment: _enrollment,
            totalGames: 3,
            selectedLevel: 'Intermediário 1',
            onLevelSelected: (_) {},
            onMakePrimary: () {},
          ),
        ),
      );

      // As 7 abreviações da escada (athlete_sports_levels_labels.dart) —
      // nenhuma deve sumir em reticências (Wrap em vez de Row+Expanded).
      const expectedLabels = [
        'Inic. 1',
        'Inic. 2',
        'Int. 1',
        'Int. 2',
        'Av. 1',
        'Av. 2',
        'Open',
      ];
      for (final label in expectedLabels) {
        expect(
          find.text(label),
          findsOneWidget,
          reason: 'chip "$label" deveria estar visível e sem truncar',
        );
      }
    },
  );

  const _windowHint =
      'Até a sua primeira inscrição neste esporte você pode ajustar o '
      'nível livremente — depois ele só sobe.';

  testWidgets(
    'pré-lock (levelLocked: false): nenhum chip abaixo do salvo mostra '
    'cadeado, e o aviso da janela aparece',
    (tester) async {
      await tester.pumpWidget(
        _wrap(
          AthleteSportLevelCard(
            enrollment: _enrollment,
            totalGames: 3,
            selectedLevel: 'Intermediário 1',
            // Rank de "Intermediário 1" = 2: com o lock ligado os chips
            // "Inic. 1"/"Inic. 2" mostrariam cadeado — aqui não devem.
            lockedLevelRank: 2,
            levelLocked: false,
            onLevelSelected: (_) {},
            onMakePrimary: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.lock_outline_rounded), findsNothing);
      expect(find.text(_windowHint), findsOneWidget);
    },
  );

  testWidgets(
    'pós-lock (levelLocked: true, default): chips abaixo do salvo mostram '
    'cadeado, e o aviso da janela some',
    (tester) async {
      await tester.pumpWidget(
        _wrap(
          AthleteSportLevelCard(
            enrollment: _enrollment,
            totalGames: 3,
            selectedLevel: 'Intermediário 1',
            lockedLevelRank: 2,
            onLevelSelected: (_) {},
            onMakePrimary: () {},
          ),
        ),
      );

      // Iniciante 1 (rank 0) e Iniciante 2 (rank 1) ficam abaixo do rank 2
      // salvo -> 2 cadeados.
      expect(find.byIcon(Icons.lock_outline_rounded), findsNWidgets(2));
      expect(find.text(_windowHint), findsNothing);
    },
  );
}
