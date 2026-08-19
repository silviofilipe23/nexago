import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_map_pins_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_map_sheet.dart';

ArenaListItem _arena({
  required String id,
  required String name,
  double? lat = -16.68,
  double? lng = -49.26,
  bool unclaimed = false,
}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 80,
    city: 'Goiânia',
    state: 'GO',
    latitude: lat,
    longitude: lng,
    isUnclaimed: unclaimed,
  );
}

FilteredArenaSearchResult _item(ArenaListItem arena, {bool available = true}) {
  return FilteredArenaSearchResult(
    result: ArenaSearchResult(
      arena: arena,
      selectedSlot: available
          ? ArenaSlot(
              id: 'slot-${arena.id}',
              arenaId: arena.id,
              courtId: 'court-1',
              date: DateTime(2026, 8, 20),
              startTime: '19:00',
              endTime: '20:00',
              rawStatus: 'available',
              priceReais: 80,
            )
          : null,
      courtName: available ? 'Quadra 1' : null,
      isExactMatch: available,
      minutesDistance: null,
      displayPricePerHourReais: 80,
    ),
    kmDistance: null,
  );
}

ArenaResultsCallbacks _callbacks({VoidCallback? onSignupTap}) {
  return ArenaResultsCallbacks(
    onOpenArena: (_) {},
    onSortTap: () {},
    onSignupTap: onSignupTap ?? () {},
    onToggleFavorite: (_) {},
    onReserve: (_) {},
    onContactUnclaimed: (_, __) {},
    onShowAllArenas: () {},
    onOpenFilters: () {},
  );
}

Future<void> _pump(
  WidgetTester tester, {
  required List<FilteredArenaSearchResult> results,
  int hiddenByFiltersCount = 0,
  VoidCallback? onSignupTap,
}) async {
  final split = splitArenaMapResults(results: results);

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ArenaResultsList(
          items: split.pins
              .map(
                (pin) => results.firstWhere(
                  (r) => r.result.arena.id == pin.arenaId,
                ),
              )
              .toList(growable: false),
          offMapItems: split.offMap,
          searchQuery: '',
          selectedSportChip: ArenaSportChip.all,
          stateFor: (_) => const ArenaSheetItemState(
            isFavorite: false,
            isFavoritePending: false,
            isBestPrice: false,
          ),
          callbacks: _callbacks(onSignupTap: onSignupTap),
          hiddenByFiltersCount: hiddenByFiltersCount,
        ),
      ),
    ),
  );
  // `AppEmptyView` entra por `FadeSlideIn`, que agenda um Timer no initState:
  // sem drenar a animação o teste morre com "A Timer is still pending".
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('arena sem coordenada aparece sob a seção própria', (
    tester,
  ) async {
    await _pump(
      tester,
      results: [
        _item(_arena(id: 'no-mapa', name: 'Arena do Mapa')),
        _item(
          _arena(id: 'fora', name: 'Arena Sem Coordenada', lat: null, lng: null),
        ),
      ],
    );

    // As duas continuam alcançáveis — a sem coordenada não some da busca só
    // porque não tem pino.
    expect(find.text('Arena do Mapa'), findsOneWidget);
    expect(find.text('Arena Sem Coordenada'), findsOneWidget);
    expect(find.text('Sem localização no mapa'), findsOneWidget);
  });

  testWidgets('sem arena fora do mapa, a seção não aparece', (tester) async {
    await _pump(
      tester,
      results: [_item(_arena(id: 'a', name: 'Arena Única'))],
    );

    expect(find.text('Arena Única'), findsOneWidget);
    expect(find.text('Sem localização no mapa'), findsNothing);
  });

  testWidgets('o cabeçalho conta arenas com e sem pino', (tester) async {
    await _pump(
      tester,
      results: [
        _item(_arena(id: 'a', name: 'Arena A')),
        _item(_arena(id: 'b', name: 'Arena B', lat: null, lng: null)),
        _item(_arena(id: 'c', name: 'Arena C')),
      ],
    );

    expect(find.text('3 arenas'), findsOneWidget);
  });

  testWidgets('uma arena só usa o singular', (tester) async {
    await _pump(tester, results: [_item(_arena(id: 'a', name: 'Arena A'))]);

    expect(find.text('1 arena'), findsOneWidget);
  });

  testWidgets('busca vazia convida a cadastrar arena', (tester) async {
    var signupTaps = 0;
    await _pump(
      tester,
      results: const [],
      onSignupTap: () => signupTaps++,
    );

    expect(find.text('Nenhuma arena encontrada'), findsOneWidget);
    await tester.tap(find.text('Quero cadastrar minha arena'));
    expect(signupTaps, 1);
  });

  testWidgets('filtros que escondem tudo oferecem "ver todas"', (tester) async {
    await _pump(tester, results: const [], hiddenByFiltersCount: 7);

    expect(find.text('Filtros ocultaram as arenas'), findsOneWidget);
    expect(find.textContaining('7 arenas ocultas'), findsOneWidget);
    expect(find.text('Ver todas'), findsOneWidget);
  });

  // A regressão que essa trava pega: passar a lista inteira como `items` E o
  // recorte sem coordenada como `offMapItems` desenhava a mesma arena duas
  // vezes, sem erro nenhum.
  test('a mesma arena nas duas seções falha em debug', () {
    final item = _item(_arena(id: 'repetida', name: 'Arena Repetida'));

    expect(
      () => ArenaResultsList(
        items: [item],
        offMapItems: [item],
        searchQuery: '',
        selectedSportChip: ArenaSportChip.all,
        stateFor: (_) => const ArenaSheetItemState(
          isFavorite: false,
          isFavoritePending: false,
          isBestPrice: false,
        ),
        callbacks: _callbacks(),
      ),
      throwsAssertionError,
    );
  });

  testWidgets('arena pré-cadastrada não mostra botão de reservar', (
    tester,
  ) async {
    await _pump(
      tester,
      results: [
        _item(
          _arena(id: 'pre', name: 'Arena Pré-cadastrada', unclaimed: true),
          available: false,
        ),
      ],
    );

    expect(find.text('Arena Pré-cadastrada'), findsOneWidget);
    expect(find.text('Reservar'), findsNothing);
  });
}
