import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_sport_codes.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_sport_chips.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/arena_search/arena_search_unclaimed_card.dart';

/// Multiesporte fase 5a: o esporte da quadra casa por IGUALDADE de código (rótulo legado ou
/// código gravado), sem substring e sem o nome da arena. Espelha `arena-sport-match.spec.ts`.
ArenaListItem _arena(List<String> courtTypes, {String name = 'Arena Central'}) {
  return ArenaListItem(
    id: 'a1',
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 80,
    city: 'Goiânia',
    state: 'GO',
    courtTypes: courtTypes,
  );
}

void main() {
  test('rótulo legado e código casam o mesmo chip', () {
    expect(
      arenaMatchesSportChip(
        _arena(['Beach tennis']),
        ArenaSportChip.beachTennis,
      ),
      isTrue,
    );
    expect(
      arenaMatchesSportChip(
        _arena(['beachTennis']),
        ArenaSportChip.beachTennis,
      ),
      isTrue,
    );
    expect(
      arenaMatchesSportChip(
        _arena(['Vôlei indoor']),
        ArenaSportChip.volleyball,
      ),
      isTrue,
    );
    expect(
      arenaMatchesSportChip(
        _arena(['indoorVolleyball']),
        ArenaSportChip.volleyball,
      ),
      isTrue,
    );
  });

  test(
    'sem substring: beach tennis não aparece em vôlei de praia (nem por "praia" no nome)',
    () {
      expect(
        arenaMatchesSportChip(
          _arena(['Beach tennis'], name: 'Praia Clube'),
          ArenaSportChip.beachVolleyball,
        ),
        isFalse,
      );
      expect(
        arenaMatchesSportChip(
          _arena(['Vôlei de praia']),
          ArenaSportChip.beachTennis,
        ),
        isFalse,
      );
      expect(
        arenaMatchesSportChip(
          _arena(['Vôlei de praia']),
          ArenaSportChip.volleyball,
        ),
        isFalse,
      );
      expect(
        arenaMatchesSportChip(_arena(['Tênis']), ArenaSportChip.beachTennis),
        isFalse,
      );
    },
  );

  test('futevôlei tem chip próprio e o perfil FUTEVOLEI abre nele', () {
    expect(
      arenaSearchSportOptions.any((o) => o.$1 == ArenaSportChip.footvolley),
      isTrue,
    );
    expect(
      arenaMatchesSportChip(_arena(['Futevôlei']), ArenaSportChip.footvolley),
      isTrue,
    );
    expect(
      arenaMatchesSportChip(
        _arena(['Futevôlei']),
        ArenaSportChip.beachVolleyball,
      ),
      isFalse,
    );
    expect(
      defaultSportChipFromProfile(primarySport: 'FUTEVOLEI'),
      ArenaSportChip.footvolley,
    );
  });

  test(
    'arena sem esporte reconhecido (vazia, só superfície, só pickleball) não é filtrada',
    () {
      expect(arenaHasIndexedSportMetadata(_arena(const [])), isFalse);
      expect(arenaHasIndexedSportMetadata(_arena(['Areia'])), isFalse);
      expect(
        arenaMatchesSportChip(_arena(['Areia']), ArenaSportChip.tennis),
        isTrue,
      );
      expect(
        arenaMatchesSportChip(_arena(['Pickleball']), ArenaSportChip.tennis),
        isTrue,
      );
      expect(arenaHasIndexedSportMetadata(_arena(['footvolley'])), isTrue);
    },
  );

  test(
    'rótulos para exibição: catálogo, sem duplicar código + rótulo; desconhecido segue cru',
    () {
      expect(
        arenaSportLabels([
          'beachVolleyball',
          'Vôlei de praia',
          'Pickleball',
          'Areia',
        ]),
        ['Vôlei de praia', 'Pickleball', 'Areia'],
      );
      expect(courtSportLabel('beachTennis'), 'Beach tennis');
      expect(courtSportLabel('Pickleball'), 'Pickleball');
      expect(courtSportLabel(''), '');
    },
  );

  test('quadra exibe esporte pelo catálogo (subtítulo e badge)', () {
    const court = ArenaCourt(
      id: 'c1',
      name: 'Q1',
      sportTypes: ['beachTennis', 'tennis'],
    );
    expect(court.sportTypesLabel, 'Beach tennis · Tênis');
    expect(courtSurfaceBadgeLabel(_arena(const []), court), 'BEACH TENNIS');
  });

  testWidgets('card de arena não reivindicada mostra o rótulo, não o código', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: ArenaSearchUnclaimedCard(
              arena: _arena(['beachTennis', 'Beach tennis', 'footvolley']),
              searchQuery: '',
              kmDistance: null,
              onContact: null,
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('beachTennis'), findsNothing);
    expect(find.textContaining('Beach tennis · Futevôlei'), findsOneWidget);
  });

  test('formulário do dono marca a opção certa para código ou rótulo gravado (sem duplicar)', () {
    const options = ['Vôlei de praia', 'Beach tennis', 'Vôlei indoor', 'Pickleball'];
    expect(
      courtTypeOptionsFor(['beachVolleyball', 'Vôlei de praia', 'indoorVolleyball', 'Pickleball'], options),
      ['Vôlei de praia', 'Vôlei indoor', 'Pickleball'],
    );
    // Valor que nenhuma opção cobre segue cru (não some do doc ao salvar).
    expect(courtTypeOptionsFor(['curling'], options), ['curling']);
  });
}
