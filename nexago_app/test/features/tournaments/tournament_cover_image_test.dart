import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_cover_image.dart';

void main() {
  const gradienteKey = Key('gradiente-da-tela');

  Widget wrap({String? coverUrl, String? sport}) => MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(
      body: SizedBox(
        width: 320,
        height: 180,
        child: TournamentCoverImage(
          coverUrl: coverUrl,
          sport: sport,
          placeholder: (_) => const ColoredBox(
            key: gradienteKey,
            color: Color(0xFF123456),
          ),
        ),
      ),
    ),
  );

  String? assetRenderizado(WidgetTester tester) {
    for (final img in tester.widgetList<Image>(find.byType(Image))) {
      final provider = img.image;
      if (provider is AssetImage) return provider.assetName;
    }
    return null;
  }

  testWidgets('sem capa própria, usa a arte do esporte', (tester) async {
    await tester.pumpWidget(wrap(sport: 'beachVolleyball'));

    expect(assetRenderizado(tester), 'assets/images/sports/volei_praia.webp');
    expect(find.byKey(gradienteKey), findsNothing);
  });

  testWidgets('capa em branco conta como ausente', (tester) async {
    // O Firestore guarda string vazia em torneio que teve a capa removida.
    await tester.pumpWidget(wrap(coverUrl: '   ', sport: 'footvolley'));

    expect(assetRenderizado(tester), 'assets/images/sports/futevolei.webp');
  });

  testWidgets('a arte não substitui a capa que o organizador subiu', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(coverUrl: 'https://exemplo.test/capa.jpg', sport: 'beachVolleyball'),
    );

    final rede = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );
    expect(rede.imageUrl, 'https://exemplo.test/capa.jpg');
  });

  testWidgets('enquanto a capa carrega mostra o gradiente, não a arte', (
    tester,
  ) async {
    // A arte como placeholder daria um flash de foto genérica trocando pela
    // capa certa — pior que o gradiente neutro que já havia.
    await tester.pumpWidget(
      wrap(coverUrl: 'https://exemplo.test/capa.jpg', sport: 'beachVolleyball'),
    );

    expect(find.byKey(gradienteKey), findsOneWidget);
    expect(assetRenderizado(tester), isNull);
  });

  testWidgets('capa que não carrega cai na arte do esporte', (tester) async {
    // A falha de rede não acontece sozinha sob `flutter_test`, então o teste
    // renderiza o próprio `errorWidget` que o componente entrega — é o caminho
    // que uma URL podre no Storage percorre.
    await tester.pumpWidget(
      wrap(coverUrl: 'https://exemplo.test/capa.jpg', sport: 'beachVolleyball'),
    );
    final rede = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Builder(
            builder: (context) =>
                rede.errorWidget!(context, rede.imageUrl, 'falhou'),
          ),
        ),
      ),
    );

    expect(assetRenderizado(tester), 'assets/images/sports/volei_praia.webp');
  });

  testWidgets('esporte sem arte cai no gradiente da tela', (tester) async {
    // Torneio legado sem `sport` não pode pedir asset fora do bundle: o
    // gradiente segue sendo o último recurso.
    for (final sport in [null, '', 'xadrez']) {
      await tester.pumpWidget(wrap(sport: sport));

      expect(tester.takeException(), isNull);
      expect(find.byKey(gradienteKey), findsOneWidget, reason: 'para $sport');
      expect(assetRenderizado(tester), isNull, reason: 'para $sport');
    }
  });
}
