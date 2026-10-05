import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/features/arena/data/court_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_metadata.dart';
import 'package:nexago_app/features/arenas/domain/arena_sport_codes.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_sport_chips.dart';

/// Multiesporte fase 5b: quem grava (formulário de quadra, perfil e sync de `arenas.courtTypes`)
/// grava o CÓDIGO do esporte. Valor fora do catálogo ("Pickleball", superfície) segue como texto.
void main() {
  test(
    'opções de esporte da quadra vêm do catálogo (arenaCourtTypes) + Pickleball',
    () {
      final catalogCodes = [
        for (final e in kSportCatalog)
          if (e.arenaCourtTypes.isNotEmpty) e.code,
      ];
      expect(kCourtSportOptions.map((o) => o.value).toList(), [
        ...catalogCodes,
        'Pickleball',
      ]);
      expect(
        kCourtSportOptions.firstWhere((o) => o.value == 'beachTennis').label,
        'Beach tennis',
      );
    },
  );

  test(
    'valores gravados (rótulo ou código) viram código; desconhecido segue cru',
    () {
      expect(
        courtTypeCodesFor([
          'Vôlei de praia',
          'beachVolleyball',
          'Beach tennis',
          'Pickleball',
          'Areia',
        ]),
        ['beachVolleyball', 'beachTennis', 'Pickleball', 'Areia'],
      );
    },
  );

  test('quadra grava types/type/sport em código', () {
    expect(CourtService.courtSportFields(['Vôlei de praia', 'Futevôlei']), {
      'types': ['beachVolleyball', 'footvolley'],
      'type': 'beachVolleyball',
      'sport': 'beachVolleyball',
    });
    expect(
      () => CourtService.courtSportFields(const []),
      throwsA(isA<CourtServiceException>()),
    );
  });

  test('sync de arenas.courtTypes une perfil + quadras em código', () {
    expect(
      ArenaSearchMetadata.mergeSportCodes(
        profileSports: const ['Vôlei de praia'],
        courtTypeLabels: const [
          'beachVolleyball',
          'Beach tennis',
          'Pickleball',
        ],
      ),
      ['beachVolleyball', 'beachTennis', 'Pickleball'],
    );
  });

  test('trava catálogo × chips da busca: todo esporte com quadra tem chip', () {
    final chipCodes = {
      for (final o in arenaSearchSportOptions)
        if (o.$1 != ArenaSportChip.all) arenaSportChipCode(o.$1),
    };
    final catalogCodes = {
      for (final e in kSportCatalog)
        if (e.arenaCourtTypes.isNotEmpty) e.code,
    };
    expect(chipCodes, catalogCodes);
    expect(SportCatalog.resolve('footvolley')?.code, 'footvolley');
  });
}
