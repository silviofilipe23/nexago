import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_filters_sheet.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_sport_chips.dart';

ArenaSearchFilters _filters({ArenaSportChip? sport}) {
  return ArenaSearchFilters.defaults().copyWith(sportChip: sport);
}

/// Abre a folha, executa a interação e devolve o que ela aplicou.
///
/// Nulo quando a folha foi fechada sem aplicar.
Future<ArenaSearchFilters?> _openSheet(
  WidgetTester tester, {
  required ArenaSearchFilters initial,
  Future<void> Function()? interaction,
}) async {
  ArenaSearchFilters? applied;
  var opened = false;

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) {
            if (!opened) {
              opened = true;
              WidgetsBinding.instance.addPostFrameCallback((_) async {
                applied = await showArenaSearchFiltersSheet(
                  context: context,
                  initial: initial,
                  previewResultCount: (_) => 7,
                );
              });
            }
            return const SizedBox.expand();
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();

  if (interaction != null) {
    await interaction();
    await tester.pumpAndSettle();
  }
  return applied;
}

void main() {
  testWidgets('a folha mostra a seção de esporte com todas as opções', (
    tester,
  ) async {
    await _openSheet(tester, initial: _filters());

    expect(find.text('ESPORTE'), findsOneWidget);
    for (final (_, label, _) in arenaSearchSportOptions) {
      expect(
        find.text(label),
        findsWidgets,
        reason: '"$label" precisa estar na folha de filtros',
      );
    }
  });

  testWidgets('escolher um esporte volta no filtro aplicado', (tester) async {
    final applied = await _openSheet(
      tester,
      initial: _filters(sport: ArenaSportChip.beachVolleyball),
      interaction: () async {
        await tester.tap(find.text('Beach tênis'));
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('Mostrar'));
      },
    );

    expect(applied, isNotNull);
    expect(applied!.sportChip, ArenaSportChip.beachTennis);
  });

  testWidgets('esporte é escolha única: o anterior sai ao escolher outro', (
    tester,
  ) async {
    final applied = await _openSheet(
      tester,
      initial: _filters(sport: ArenaSportChip.beachVolleyball),
      interaction: () async {
        await tester.tap(find.text('Beach tênis'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Padel'));
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('Mostrar'));
      },
    );

    expect(applied!.sportChip, ArenaSportChip.padel);
  });

  testWidgets('"Limpar" devolve o esporte para Todos', (tester) async {
    // Mesmo destino do "ver todas" da lista: limpar filtro de esporte é
    // mostrar todos, não voltar ao esporte do perfil.
    final applied = await _openSheet(
      tester,
      initial: _filters(sport: ArenaSportChip.padel),
      interaction: () async {
        await tester.tap(find.text('Limpar'));
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('Mostrar'));
      },
    );

    expect(applied!.sportChip, ArenaSportChip.all);
  });

  testWidgets('esporte fora do padrão conta como filtro ativo', (tester) async {
    // É o que acende o badge no botão de filtros agora que o chip saiu da
    // barra flutuante — sem isso, o esporte escolhido ficaria invisível.
    expect(
      countActiveSearchFilters(_filters(sport: ArenaSportChip.padel)),
      greaterThan(0),
    );
    expect(
      countActiveSearchFilters(
        _filters(sport: ArenaSearchFilters.defaultSportChip),
      ),
      0,
    );
  });
}
