import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/slots/slots_page_header.dart';

void main() {
  const title = 'Arena Vegeton · Quadra 1';

  Widget wrap({String? coverUrl, VoidCallback? onBack, ThemeData? theme}) =>
      MaterialApp(
        theme: theme ?? AppTheme.dark,
        home: Scaffold(
          body: SlotsPageHeader(
            title: title,
            onBack: onBack ?? () {},
            coverUrl: coverUrl,
          ),
        ),
      );

  testWidgets('sem capa fica a barra simples, sem foto', (tester) async {
    await tester.pumpWidget(wrap());

    expect(find.byType(CachedNetworkImage), findsNothing);
    expect(find.text(title), findsOneWidget);
  });

  testWidgets('capa em branco conta como ausente', (tester) async {
    // O perfil grava `coverUrl` vazio quando o gestor remove a capa.
    await tester.pumpWidget(wrap(coverUrl: '   '));

    expect(find.byType(CachedNetworkImage), findsNothing);
  });

  testWidgets('com capa, a foto da arena vira o cabeçalho', (tester) async {
    await tester.pumpWidget(wrap(coverUrl: 'https://exemplo.test/capa.jpg'));

    final rede = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );
    expect(rede.imageUrl, 'https://exemplo.test/capa.jpg');
    expect(rede.fit, BoxFit.cover);
    expect(find.text(title), findsOneWidget);
  });

  testWidgets('sobre a foto o título é branco também no tema claro', (
    tester,
  ) async {
    // O texto fica em cima da foto escurecida: a cor do tema (escura no claro)
    // sumiria na foto.
    await tester.pumpWidget(
      wrap(coverUrl: 'https://exemplo.test/capa.jpg', theme: AppTheme.light),
    );

    final text = tester.widget<Text>(find.text(title));
    expect(text.style?.color, Colors.white);
  });

  testWidgets('o voltar continua funcionando sobre a capa', (tester) async {
    var backs = 0;
    await tester.pumpWidget(
      wrap(coverUrl: 'https://exemplo.test/capa.jpg', onBack: () => backs++),
    );

    await tester.tap(find.bySemanticsLabel('Voltar'));
    expect(backs, 1);
  });
}
