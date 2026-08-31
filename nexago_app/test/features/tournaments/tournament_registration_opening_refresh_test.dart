// Atleta parado na tela esperando a abertura: às 09:59 o gate de
// `registrationOpensAt` diz "em breve", e às 10:00 ninguém reconstrói o widget
// — o CTA seguia travado até um scroll, um pull-to-refresh ou uma volta de
// navegação. A vitrine e o detalhe agora se acertam sozinhos no instante.
//
// O gate compara relógio de parede, que o `pump` do teste não move: a janela
// aqui é curta e o tempo passa de verdade dentro de `runAsync`.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_categories_tab.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_discovery_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  /// Folga entre montar a tela e a abertura — e a espera real que a cruza.
  const janela = Duration(milliseconds: 1500);
  const esperaReal = Duration(milliseconds: 2500);

  const offer = TournamentCategoryOffer(
    id: 'masc-b',
    name: 'Masculino B',
    entryFee: 140,
    maxTeams: 8,
    spotsLeft: 2,
    spotsTotal: 8,
  );

  DiscoveryTournament buildDiscovery(DateTime opensAt) {
    return DiscoveryTournament(
      id: 't1',
      name: 'Copa Teste',
      location: 'Arena Teste',
      city: 'Goiânia',
      dateLabel: '16/08',
      startDate: DateTime(2026, 8, 16),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: r'R$ 140,00',
      priceValue: 140,
      spotsLeft: 2,
      spotsTotal: 8,
      status: TournamentListingStatus.open,
      featured: false,
      enrolledCount: 6,
      liveMatchesNow: 0,
      categoryOffers: const [offer],
      registrationOpensAt: opensAt,
    );
  }

  TournamentDetail buildDetail(DateTime opensAt) {
    return TournamentDetail(
      id: 't1',
      name: 'Copa Teste',
      location: 'Arena Teste',
      city: 'Goiânia',
      dateLabel: '16/08',
      startDate: DateTime(2026, 8, 16),
      endDate: DateTime(2026, 8, 16),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: r'R$ 140,00',
      priceValue: 140,
      spotsLeft: 2,
      spotsTotal: 8,
      status: TournamentListingStatus.open,
      featured: false,
      enrolledCount: 6,
      liveMatchesNow: 0,
      categoryOffers: const [offer],
      registrationOpensAt: opensAt,
    );
  }

  Future<void> pumpWidget(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentCategoryEnrollmentCountsProvider.overrideWith(
            (ref, tournamentId) => Stream.value(const {'masc-b': 6}),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(body: child),
        ),
      ),
    );
    await tester.pump();
  }

  /// Deixa o relógio de parede cruzar a abertura e dá ao timer a chance de
  /// disparar — sem novo build vindo de fora.
  Future<void> passaDaAbertura(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(esperaReal));
    await tester.pump(esperaReal);
  }

  testWidgets('vitrine: CTA de inscrição habilita sozinho na abertura', (
    tester,
  ) async {
    await pumpWidget(
      tester,
      SingleChildScrollView(
        child: TournamentDiscoveryCard(
          tournament: buildDiscovery(DateTime.now().add(janela)),
          onTap: () {},
        ),
      ),
    );

    expect(find.text('Ver detalhes →'), findsOneWidget);
    expect(find.text('INSCRIÇÕES EM BREVE'), findsOneWidget);

    await passaDaAbertura(tester);

    expect(find.text('Inscrever →'), findsOneWidget);
    expect(find.text('INSCRIÇÕES ABERTAS'), findsOneWidget);
  });

  testWidgets('categorias: CTA da categoria habilita sozinho na abertura', (
    tester,
  ) async {
    await pumpWidget(
      tester,
      TournamentDetailCategoriesTab(
        tournament: buildDetail(DateTime.now().add(janela)),
        enrollmentByCategoryId: const {'masc-b': 6},
        enrollmentCountsResolved: true,
      ),
    );

    expect(find.text('Inscrever-se →'), findsNothing);

    await passaDaAbertura(tester);

    expect(find.text('Inscrever-se →'), findsOneWidget);
  });
}
