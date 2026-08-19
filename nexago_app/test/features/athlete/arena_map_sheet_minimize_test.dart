import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_map_sheet.dart';

FilteredArenaSearchResult _item(int i) {
  final arena = ArenaListItem(
    id: 'arena-$i',
    name: 'Arena $i',
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 80,
    city: 'Goiânia',
    state: 'GO',
    latitude: -16.68,
    longitude: -49.26,
  );
  return FilteredArenaSearchResult(
    result: ArenaSearchResult(
      arena: arena,
      selectedSlot: ArenaSlot(
        id: 'slot-$i',
        arenaId: arena.id,
        courtId: 'court-1',
        date: DateTime(2026, 8, 20),
        startTime: '19:00',
        endTime: '20:00',
        rawStatus: 'available',
        priceReais: 80,
      ),
      courtName: 'Quadra 1',
      isExactMatch: true,
      minutesDistance: null,
      displayPricePerHourReais: 80,
    ),
    kmDistance: null,
  );
}

final _callbacks = ArenaResultsCallbacks(
  onOpenArena: (_) {},
  onSortTap: () {},
  onSignupTap: () {},
  onToggleFavorite: (_) {},
  onReserve: (_) {},
  onContactUnclaimed: (_, __) {},
  onShowAllArenas: () {},
  onOpenFilters: () {},
);

Future<void> _pump(WidgetTester tester) async {
  final items = List.generate(20, _item);

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Stack(
          children: [
            ArenaMapSheet(
              list: (controller) => ArenaResultsList(
                items: items,
                offMapItems: const [],
                searchQuery: '',
                selectedSportChip: ArenaSportChip.all,
                stateFor: (_) => const ArenaSheetItemState(
                  isFavorite: false,
                  isFavoritePending: false,
                  isBestPrice: false,
                ),
                callbacks: _callbacks,
                scrollController: controller,
              ),
              stateFor: (_) => const ArenaSheetItemState(
                isFavorite: false,
                isFavoritePending: false,
                isBestPrice: false,
              ),
              callbacks: _callbacks,
              searchQuery: '',
              selectedSportChip: ArenaSportChip.all,
            ),
          ],
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

final _minimizar = find.text('Minimizar');

/// Arrasta a lista. [dy] negativo sobe o dedo (expande / rola para baixo);
/// positivo desce o dedo (rola a lista de volta para cima).
Future<void> _arrasta(WidgetTester tester, double dy) async {
  await tester.drag(find.byType(ArenaResultsList), Offset(0, dy));
  await tester.pumpAndSettle();
}

/// Expande o sheet e entra na lista.
///
/// São dois gestos porque o primeiro só levanta o sheet: enquanto a lista
/// estiver no topo, arrastar para baixo recolhe o sheet em vez de rolar. Só
/// depois de descer na lista é que existe rolagem para desfazer.
Future<void> _expandeEEntra(WidgetTester tester) async {
  await _arrasta(tester, -400);
  await _arrasta(tester, -400);
}

void main() {
  testWidgets('a pastilha não nasce na tela', (tester) async {
    await _pump(tester);

    expect(_minimizar, findsNothing);
  });

  testWidgets('expandir o sheet sozinho não traz a pastilha', (tester) async {
    await _pump(tester);
    // Arrastar para cima conta como rolagem `reverse`: o atleta está indo
    // PARA a lista, não saindo dela.
    await _arrasta(tester, -400);

    expect(_minimizar, findsNothing);
  });

  testWidgets('rolar de volta para cima traz a pastilha', (tester) async {
    await _pump(tester);
    await _expandeEEntra(tester);
    await _arrasta(tester, 150);

    expect(_minimizar, findsOneWidget);
  });

  testWidgets('rolar para baixo esconde de novo', (tester) async {
    await _pump(tester);
    await _expandeEEntra(tester);
    await _arrasta(tester, 150);
    expect(_minimizar, findsOneWidget);

    await _arrasta(tester, -150);

    expect(_minimizar, findsNothing);
  });

  testWidgets('tocar na pastilha recolhe o sheet e ela some', (tester) async {
    await _pump(tester);
    await _expandeEEntra(tester);
    await _arrasta(tester, 150);

    await tester.tap(_minimizar);
    await tester.pumpAndSettle();

    expect(_minimizar, findsNothing);
  });

  testWidgets('com o sheet na altura de descanso não há o que minimizar', (
    tester,
  ) async {
    await _pump(tester);
    // Rolar para cima sem ter expandido: não existe nada para recolher.
    await _arrasta(tester, 120);

    expect(_minimizar, findsNothing);
  });
}
