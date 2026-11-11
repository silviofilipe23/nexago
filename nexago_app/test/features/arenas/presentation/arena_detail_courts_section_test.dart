import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_court_card.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_courts_section.dart';

const _arena = ArenaListItem(
  id: 'a1',
  name: 'Arena Sol',
  locationLabel: 'Centro',
  pricePerHourReais: 100,
);

ArenaDetailTodaySummary _today(List<(String, List<String>)> courts) {
  final summaries = [
    for (final (name, sports) in courts)
      ArenaCourtDaySummary(
        court: ArenaCourt(id: name, name: name, sportTypes: sports),
        freeSlotsToday: 2,
      ),
  ];
  return ArenaDetailTodaySummary(
    courts: summaries,
    totalActiveCourts: summaries.length,
    freeCourtsToday: summaries.length,
    totalFreeSlotsToday: summaries.length * 2,
  );
}

Future<List<String>> _pump(
  WidgetTester tester,
  ArenaDetailTodaySummary today,
) async {
  tester.view.physicalSize = const Size(402, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final opened = <String>[];
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: SingleChildScrollView(
          child: ArenaDetailCourtsSection(
            arena: _arena,
            today: today,
            loading: false,
            onOpenCourt: opened.add,
          ),
        ),
      ),
    ),
  );
  return opened;
}

void main() {
  testWidgets('até 4 quadras: lista inteira, sem "Ver todas" nem filtros',
      (tester) async {
    await _pump(
      tester,
      _today([
        for (var i = 1; i <= 4; i++) ('Quadra $i', ['beachTennis']),
      ]),
    );
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(4));
    expect(find.textContaining('Ver todas'), findsNothing);
    expect(find.text('Todas'), findsNothing);
  });

  testWidgets(
      'mais de 4: retraída em 4, expande e recolhe; toque abre a quadra',
      (tester) async {
    final opened = await _pump(
      tester,
      _today([
        for (var i = 1; i <= 7; i++) ('Quadra $i', ['beachTennis']),
      ]),
    );
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(4));
    expect(find.text('Ver todas as 7 quadras'), findsOneWidget);
    expect(find.text('+3'), findsOneWidget);
    // Um esporte só: sem filtros.
    expect(find.text('Todas'), findsNothing);

    await tester.tap(find.text('Ver todas as 7 quadras'));
    await tester.pumpAndSettle();
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(7));
    expect(find.text('Mostrar menos'), findsOneWidget);

    await tester.tap(find.text('Quadra 6'));
    expect(opened, ['Quadra 6']);

    await tester.tap(find.text('Mostrar menos'));
    await tester.pumpAndSettle();
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(4));
  });

  testWidgets('mais de 4 e mais de um esporte: filtro por esporte',
      (tester) async {
    await _pump(
      tester,
      _today([
        ('Quadra 1', ['beachTennis']),
        ('Quadra 2', ['beachTennis']),
        ('Quadra 3', ['Vôlei de praia']),
        ('Quadra 4', ['beachTennis']),
        ('Quadra 5', ['Vôlei de praia']),
        ('Quadra 6', ['beachTennis']),
      ]),
    );
    expect(find.text('Todas'), findsOneWidget);
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(4));

    // Fonte de teste é larga: os chips rolam na horizontal.
    final chip = find.text('Vôlei de praia');
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(find.byType(ArenaDetailCourtCard), findsNWidgets(2));
    expect(find.text('Quadra 3'), findsOneWidget);
    expect(find.text('Quadra 5'), findsOneWidget);
    // Filtrado cabe em 4: sem "Ver todas".
    expect(find.textContaining('Ver todas'), findsNothing);

    await tester.ensureVisible(find.text('Todas'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Todas'));
    await tester.pumpAndSettle();
    expect(find.text('Ver todas as 6 quadras'), findsOneWidget);
  });
}
