import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';

import 'app_news_test_harness.dart';

void main() {
  testWidgets('lista: destaque, "Já usou", melhorias e versões anteriores abertas', (
    tester,
  ) async {
    final store = FakeAppNewsLocalStore(used: {'rateio'}, seen: '1.0.15');
    await pumpAppNews(tester, store: store, initialLocation: AppRoutes.appNews);

    expect(find.text('VERSÃO 1.0.15 · 27 OUT 2026'), findsOneWidget);
    expect(find.text('Novidades'), findsOneWidget);
    expect(find.text('3 NOVAS'), findsOneWidget);
    expect(find.text('Título radar'), findsOneWidget);
    expect(find.text('Abrir radar'), findsOneWidget);
    expect(find.text('Como funciona'), findsOneWidget);
    // Só a que ele usou leva a marca.
    expect(find.text('Já usou'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Placar abre mais rápido'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    // Versão anterior sempre aberta: o que entrou aparece sem toque.
    await tester.scrollUntilVisible(
      find.text('Placar ao vivo'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('5 de outubro'), findsOneWidget);
    expect(find.text('Convite de dupla'), findsOneWidget);
    expect(find.text('Chame o parceiro pelo app.'), findsOneWidget);
    expect(find.text('Placar ao vivo'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right_rounded), findsNWidgets(3));
  });

  testWidgets('detalhe: explicação, passos, onde encontrar e o botão abre a '
      'função marcando "Já usou"', (tester) async {
    final store = FakeAppNewsLocalStore(seen: '1.0.15');
    await pumpAppNews(tester, store: store, initialLocation: AppRoutes.appNews);

    await tester.tap(find.byKey(const Key('app-news-row-racha')));
    await settle(tester);

    expect(find.text('Explicação racha'), findsOneWidget);
    expect(find.text('COMO FUNCIONA'), findsOneWidget);
    expect(find.text('Passo três'), findsOneWidget);
    expect(find.text('Início › Ações rápidas'), findsOneWidget);
    expect(find.text('V1.0.15'), findsOneWidget);
    expect(find.text('NOVO'), findsOneWidget);

    await tester.tap(find.byKey(const Key('app-news-detail-cta')));
    await settle(tester);

    expect(find.text('Tela do ranking'), findsOneWidget);
    expect(store.used, {'racha'});

    // De volta ao detalhe, já marcado.
    Navigator.of(tester.element(find.text('Tela do ranking'))).pop();
    await settle(tester);
    expect(find.text('JÁ USOU'), findsOneWidget);
  });

  testWidgets('"Como funciona" no destaque abre o detalhe', (tester) async {
    await pumpAppNews(
      tester,
      store: FakeAppNewsLocalStore(seen: '1.0.15'),
      initialLocation: AppRoutes.appNews,
    );

    await tester.tap(find.text('Como funciona'));
    await settle(tester);

    expect(find.text('Explicação radar'), findsOneWidget);
  });

  testWidgets('destino que é aba do shell troca a aba e volta ao shell', (
    tester,
  ) async {
    final store = FakeAppNewsLocalStore(seen: '1.0.15');
    await pumpAppNews(tester, store: store);

    await tester.tap(find.text('Shell aba 0'));
    await settle(tester);
    await tester.tap(find.byKey(const Key('app-news-hero-cta-radar')));
    await settle(tester);

    expect(find.text('Shell aba 2'), findsOneWidget);
    expect(find.text('Novidades'), findsNothing);
    expect(store.used, {'radar'});
  });

  testWidgets('sem nada publicado para o build: mensagem vazia', (
    tester,
  ) async {
    await pumpAppNews(
      tester,
      store: FakeAppNewsLocalStore(),
      initialLocation: AppRoutes.appNews,
      installedBuild: 100,
    );

    expect(find.text('Sem novidades por enquanto.'), findsOneWidget);
  });
}
