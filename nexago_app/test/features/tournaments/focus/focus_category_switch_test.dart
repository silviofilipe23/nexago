import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_category_logic.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_providers.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_shell_page.dart';

/// Torneio com as categorias [offers] — quem joga mais de uma é o caso do
/// seletor do cabeçalho.
TournamentDetail _tournament(List<TournamentCategoryOffer> offers) {
  final today = DateTime.now();
  return TournamentDetail(
    id: 't1',
    name: 'Copa Teste',
    location: 'Arena X',
    city: 'Goiânia',
    dateLabel: '',
    startDate: today,
    endDate: today,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 90',
    priceValue: 90,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.live,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
    categoryOffers: offers,
  );
}

const _masculina = TournamentCategoryOffer(
  id: 'cat-a',
  name: 'Masculina A',
  entryFee: 90,
);
const _misto = TournamentCategoryOffer(
  id: 'cat-b',
  name: 'Misto B',
  entryFee: 90,
);

Widget _app({
  required List<TournamentCategoryOffer> offers,
  required Map<String, String> teams,
}) {
  return ProviderScope(
    overrides: [
      tournamentDetailProvider('t1')
          .overrideWith((ref) => Stream.value(_tournament(offers))),
      tournamentMatchCardsProvider('t1')
          .overrideWith((ref) => Stream.value(const [])),
      tournamentUserTeamIdsByCategoryProvider('t1')
          .overrideWith((ref) => Stream.value(teams)),
      myTournamentPredictionEntryProvider('t1')
          .overrideWith((ref) async => null),
    ],
    child: MaterialApp(
      theme: ThemeData(platform: TargetPlatform.iOS),
      home: const FocusShellPage(tournamentId: 't1'),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  group('resolveFocusCategoryChoice', () {
    test('a escolha do atleta vence a automática', () {
      expect(
        resolveFocusCategoryChoice(
          chosen: 'cat-b',
          automatic: 'cat-a',
          registered: const ['cat-a', 'cat-b'],
        ),
        'cat-b',
      );
    });

    test('sem escolha, ou escolha que não é mais dele, fica a automática', () {
      expect(
        resolveFocusCategoryChoice(
          chosen: null,
          automatic: 'cat-a',
          registered: const ['cat-a', 'cat-b'],
        ),
        'cat-a',
      );
      expect(
        resolveFocusCategoryChoice(
          chosen: 'cat-x',
          automatic: 'cat-a',
          registered: const ['cat-a', 'cat-b'],
        ),
        'cat-a',
        reason: 'inscrição removida não pode prender o Focus nela',
      );
    });
  });

  testWidgets('quem joga uma categoria só não vê o seletor', (tester) async {
    await tester.pumpWidget(
      _app(offers: const [_masculina, _misto], teams: const {'cat-a': 'ta'}),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('focus-category-pill')), findsNothing);
  });

  testWidgets('quem joga duas troca a categoria pelo cabeçalho',
      (tester) async {
    await tester.pumpWidget(
      _app(
        offers: const [_masculina, _misto],
        teams: const {'cat-a': 'ta', 'cat-b': 'tb'},
      ),
    );
    await tester.pumpAndSettle();

    // Sem partida nenhuma, a automática é a primeira do torneio.
    expect(find.text('MASCULINA A'), findsOneWidget);
    expect(find.byTooltip('Trocar categoria'), findsOneWidget);

    await tester.tap(find.byKey(const Key('focus-category-pill')));
    await tester.pumpAndSettle();
    expect(find.text('Ver categoria'), findsOneWidget);
    expect(find.text('Da sua próxima partida'), findsOneWidget);
    expect(find.text('Você também está inscrito'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('focus-category-cat-b')));
    await tester.pumpAndSettle();
    expect(find.text('MISTO B'), findsOneWidget);
    expect(find.text('MASCULINA A'), findsNothing);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(FocusShellPage)),
    );
    expect(container.read(focusCategoryIdProvider('t1')), 'cat-b');

    // Voltar à da próxima partida devolve a escolha ao Focus.
    await tester.tap(find.byKey(const Key('focus-category-pill')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('focus-category-cat-a')));
    await tester.pumpAndSettle();
    expect(container.read(focusCategoryChoiceProvider('t1')), isNull);
    expect(find.text('MASCULINA A'), findsOneWidget);
  });
}
