import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_news_test_harness.dart';

void main() {
  testWidgets('abre sozinho na primeira abertura depois de atualizar, grava '
      'que viu e navega: direita avança, esquerda volta, X fecha', (
    tester,
  ) async {
    final store = FakeAppNewsLocalStore(used: {'rateio'}, seen: '1.0.14');
    await pumpAppNews(tester, store: store);

    expect(store.seen, '1.0.15');
    // Rateio já foi usado: 3 stories.
    expect(find.text('NOVO NA 1.0.15 · 1 DE 3'), findsOneWidget);
    expect(find.text('Título radar'), findsOneWidget);

    await tester.tap(find.byKey(const Key('app-news-stories-next')));
    await settle(tester);
    expect(find.text('NOVO NA 1.0.15 · 2 DE 3'), findsOneWidget);
    expect(find.text('Título racha'), findsOneWidget);

    await tester.tap(find.byKey(const Key('app-news-stories-previous')));
    await settle(tester);
    expect(find.text('Título radar'), findsOneWidget);

    await tester.tap(find.byKey(const Key('app-news-stories-close')));
    await settle(tester);
    expect(find.text('Shell aba 0'), findsOneWidget);
    expect(find.text('Título radar'), findsNothing);
  });

  testWidgets('toque à direita no último fecha', (tester) async {
    final store = FakeAppNewsLocalStore(used: {'radar', 'racha'});
    await pumpAppNews(tester, store: store);

    expect(find.text('NOVO NA 1.0.15 · 1 DE 2'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-news-stories-next')));
    await settle(tester);
    expect(find.text('Fechar'), findsWidgets);
    await tester.tap(find.byKey(const Key('app-news-stories-next')));
    await settle(tester);

    expect(find.text('Shell aba 0'), findsOneWidget);
  });

  testWidgets('o botão fecha os stories e abre a função', (tester) async {
    final store = FakeAppNewsLocalStore(used: {'radar'});
    await pumpAppNews(tester, store: store);

    expect(find.text('Título racha'), findsOneWidget);
    await tester.tap(find.byKey(const Key('app-news-stories-cta')));
    await settle(tester);

    expect(find.text('Tela do ranking'), findsOneWidget);
    expect(store.used, {'radar', 'racha'});
  });

  testWidgets('uma vez por versão: já viu, não abre', (tester) async {
    await pumpAppNews(tester, store: FakeAppNewsLocalStore(seen: '1.0.15'));

    expect(find.text('Shell aba 0'), findsOneWidget);
    expect(find.byKey(const Key('app-news-stories-close')), findsNothing);
  });

  testWidgets('conta criada depois da versão (instalou agora): não abre', (
    tester,
  ) async {
    final store = FakeAppNewsLocalStore();
    await pumpAppNews(
      tester,
      store: store,
      accountCreatedAt: DateTime.utc(2026, 10, 28),
    );

    expect(find.byKey(const Key('app-news-stories-close')), findsNothing);
    expect(store.seen, isNull);
  });
}
