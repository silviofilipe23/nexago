import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_categories_tab.dart';

const _masculina = TournamentCategoryOffer(
  id: 'masc',
  name: 'Open Masculino',
  entryFee: 120,
  genderType: 'male',
  spotsTotal: 16,
);
const _feminina = TournamentCategoryOffer(
  id: 'fem',
  name: 'Open Feminino',
  entryFee: 120,
  genderType: 'female',
  spotsTotal: 16,
);

TournamentDetail buildDetail(List<TournamentCategoryOffer> offers) {
  return TournamentDetail(
    id: 't1',
    name: 'Etapa Garden',
    location: 'Arena Garden',
    city: 'Goiânia',
    dateLabel: '24/10',
    startDate: DateTime(2026, 10, 24),
    endDate: DateTime(2026, 10, 24),
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 120',
    priceValue: 120,
    spotsLeft: 10,
    spotsTotal: 32,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 22,
    liveMatchesNow: 0,
    categoryOffers: offers,
  );
}

Future<void> pumpTab(
  WidgetTester tester,
  List<TournamentCategoryOffer> offers, {
  VoidCallback? onBack,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: TournamentDetailCategoriesTab(
          tournament: buildDetail(offers),
          onBack: onBack ?? () {},
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('hero convida a escolher a categoria', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    expect(find.textContaining('Escolha sua'), findsOneWidget);
    expect(find.textContaining('categoria'), findsWidgets);
  });

  // A arte ocupa o header inteiro, então o voltar mora SOBRE ela — não existe
  // mais uma barra opaca acima da tela para abrigá-lo.
  testWidgets('voltar vive dentro do cabeçalho de arte', (tester) async {
    var voltou = false;
    await pumpTab(
      tester,
      const [_masculina, _feminina],
      onBack: () => voltou = true,
    );

    expect(find.text('Categorias'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pump();

    expect(voltou, isTrue);
  });

  testWidgets('filtro de gênero recorta a lista', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    expect(find.text('Open Masculino'), findsOneWidget);
    expect(find.text('Open Feminino'), findsOneWidget);

    await tester.tap(find.text('Feminino'));
    await tester.pump();

    expect(find.text('Open Masculino'), findsNothing);
    expect(find.text('Open Feminino'), findsOneWidget);
  });

  testWidgets('Todas restaura a lista inteira', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    await tester.tap(find.text('Feminino'));
    await tester.pump();
    await tester.tap(find.text('Todas'));
    await tester.pump();

    expect(find.text('Open Masculino'), findsOneWidget);
    expect(find.text('Open Feminino'), findsOneWidget);
  });

  testWidgets('sem filtro que recorte, a barra de filtros não aparece', (
    tester,
  ) async {
    await pumpTab(tester, const [_masculina]);

    expect(find.text('Todas'), findsNothing);
    expect(find.text('Masculino'), findsNothing);
  });

  // O organizador pode publicar um torneio sem nenhuma categoria ainda.
  testWidgets('sem categorias, avisa em vez de mostrar hero vazio', (
    tester,
  ) async {
    await pumpTab(tester, const []);

    expect(
      find.textContaining('Categorias serão publicadas'),
      findsOneWidget,
    );
  });
}
