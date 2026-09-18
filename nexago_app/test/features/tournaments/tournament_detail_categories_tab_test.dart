import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_categories_hero.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_categories_tab.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_category_chips.dart';

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
    imageUrl: 'https://exemplo.invalido/capa-do-torneio.jpg',
    categoryOffers: offers,
  );
}

Future<void> pumpTab(
  WidgetTester tester,
  List<TournamentCategoryOffer> offers, {
  VoidCallback? onBack,
}) async {
  // Os cards de categoria cresceram (capa por esporte). Na superfície padrão
  // de 800x600 o segundo fica fora da tela e o sliver preguiçoso nem chega a
  // construí-lo — `find.text` do nome dele voltaria vazio sem nada de errado
  // na filtragem, que é o que este arquivo mede.
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        home: Scaffold(
          body: TournamentDetailCategoriesTab(
            tournament: buildDetail(offers),
            onBack: onBack ?? () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

// O card de categoria exibe um chip de gênero próprio, com o mesmo texto do
// chip do filtro. Sem ancorar na barra, `find.text('Feminino')` casa os dois.
Finder _chipDoFiltro(String label) => find.descendant(
  of: find.byType(TournamentDetailCategoryChips),
  matching: find.text(label),
);

void main() {
  testWidgets('hero convida a escolher a categoria', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    expect(find.textContaining('Escolha sua'), findsOneWidget);
    expect(find.textContaining('categoria'), findsWidgets);
  });

  // A arte do HERO é sempre a do app: uma capa enviada pelo organizador não se
  // compromete a ter área escura no topo, onde o voltar e o título precisam ler.
  testWidgets('hero não usa a capa do torneio', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    // Escopo: só o HERO. O card usa a capa no próprio fundo, de propósito, e
    // isso não é assunto deste teste.
    final noHero = find.descendant(
      of: find.byType(TournamentCategoriesSliverHero),
      matching: find.byType(Image),
    );
    final imagens = tester.widgetList<Image>(noHero).toList();
    expect(imagens, isNotEmpty);
    for (final imagem in imagens) {
      // `cacheWidth` embrulha o provider num ResizeImage — o que interessa é
      // quem está dentro.
      final provider = imagem.image;
      final interno =
          provider is ResizeImage ? provider.imageProvider : provider;
      expect(
        interno,
        isA<AssetImage>(),
        reason: 'a capa do torneio não pode chegar ao hero de categorias',
      );
    }
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

    await tester.tap(_chipDoFiltro('Feminino'));
    await tester.pump();

    expect(find.text('Open Masculino'), findsNothing);
    expect(find.text('Open Feminino'), findsOneWidget);
  });

  testWidgets('Todas restaura a lista inteira', (tester) async {
    await pumpTab(tester, const [_masculina, _feminina]);

    await tester.tap(_chipDoFiltro('Feminino'));
    await tester.pump();
    await tester.tap(_chipDoFiltro('Todas'));
    await tester.pump();

    expect(find.text('Open Masculino'), findsOneWidget);
    expect(find.text('Open Feminino'), findsOneWidget);
  });

  testWidgets('sem filtro que recorte, a barra de filtros não aparece', (
    tester,
  ) async {
    await pumpTab(tester, const [_masculina]);

    expect(find.text('Todas'), findsNothing);
    // O próprio card exibe um chip de gênero ('Masculino'), então procurar
    // esse texto não distingue mais "sem barra de filtros" de "com barra".
    expect(find.byType(TournamentDetailCategoryChips), findsNothing);
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
