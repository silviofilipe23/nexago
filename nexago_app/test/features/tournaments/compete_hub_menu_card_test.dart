import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_motion.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_menu_card.dart';

void main() {
  /// Largura real de um card no grid 2x2 de um telefone comum.
  const cardWidth = 170.0;

  Widget wrap(Widget child, {ThemeData? theme, double textScale = 1}) =>
      MaterialApp(
        theme: theme ?? AppTheme.dark,
        home: Scaffold(
          body: Center(
            child: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
              child: SizedBox(width: cardWidth, child: child),
            ),
          ),
        ),
      );

  CompeteHubMenuCard card({
    String title = 'Torneios e ligas',
    String description = 'Descubra competições abertas e inscrições',
    VoidCallback? onTap,
  }) => CompeteHubMenuCard(
    imageAsset: CompeteHubArt.tournaments,
    title: title,
    description: description,
    onTap: onTap ?? () {},
  );

  testWidgets('renderiza título, descrição e seta', (tester) async {
    await tester.pumpWidget(wrap(card()));

    expect(find.text('Torneios e ligas'), findsOneWidget);
    expect(
      find.text('Descubra competições abertas e inscrições'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.arrow_forward_rounded), findsOneWidget);
  });

  testWidgets('usa a arte declarada como fundo do card', (tester) async {
    await tester.pumpWidget(wrap(card()));

    final ink = tester.widget<Ink>(find.byType(Ink));
    final decoration = ink.decoration as BoxDecoration;
    // Decodificado no tamanho de exibição, não nos 1024px do arquivo.
    final resize = decoration.image!.image as ResizeImage;
    expect(
      (resize.imageProvider as AssetImage).assetName,
      CompeteHubArt.tournaments,
    );
    expect(resize.width, isNotNull);
    expect(resize.width, lessThan(1024));
    // A arte entra escurecida; sem isso ela grita contra o canvas quase preto.
    expect(decoration.image!.colorFilter, isNotNull);
  });

  testWidgets('tap dispara onTap uma única vez', (tester) async {
    var taps = 0;
    await tester.pumpWidget(wrap(card(onTap: () => taps++)));

    await tester.tap(find.byType(CompeteHubMenuCard));
    await tester.pump();

    expect(taps, 1);
  });

  testWidgets('mantém o card em retrato na largura do grid', (tester) async {
    await tester.pumpWidget(wrap(card()));

    final size = tester.getSize(find.byType(CompeteHubMenuCard));
    expect(size.width, cardWidth);
    expect(size.height, greaterThan(size.width));
  });

  testWidgets('texto fica branco também no tema claro', (tester) async {
    // As artes são escuras nos dois temas: `onSurface` sumiria sobre a foto.
    await tester.pumpWidget(wrap(card(), theme: AppTheme.light));

    final title = tester.widget<Text>(find.text('Torneios e ligas'));
    expect(title.style!.color, AppColors.white);
  });

  testWidgets('descrição longa não estoura o card', (tester) async {
    await tester.pumpWidget(
      wrap(
        card(
          title: 'Palpites da galera',
          description:
              'Uma descrição bem longa para forçar a quebra de linha e '
              'garantir que o texto seja truncado com reticências sem causar '
              'overflow no layout do card.',
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('Palpites da galera'), findsOneWidget);
  });

  testWidgets('não estoura com fonte ampliada em 2x', (tester) async {
    await tester.pumpWidget(wrap(card(), textScale: 2));

    expect(tester.takeException(), isNull);
  });

  double scaleOf(WidgetTester tester) =>
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;

  testWidgets('encolhe sob o dedo e volta ao soltar', (tester) async {
    await tester.pumpWidget(wrap(card()));
    expect(scaleOf(tester), 1);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(CompeteHubMenuCard)),
    );
    await tester.pump();
    expect(scaleOf(tester), CompeteHubMenuCard.pressedScale);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(scaleOf(tester), 1);
  });

  testWidgets('anima com os tokens de movimento da casa', (tester) async {
    await tester.pumpWidget(wrap(card()));

    final animated = tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    expect(animated.duration, AppMotion.fast);
    expect(animated.curve, AppMotion.curve);
  });

  testWidgets('rolar a lista não encolhe o card', (tester) async {
    // Guarda contra press em nível de ponteiro (`Listener.onPointerDown`), que
    // ignora a arena de gestos e encolheria o card a cada rolagem. Os caminhos
    // por TapGestureRecognizer — este e `onTapDown` — já perdem a arena para o
    // scroll sozinhos; sabotei os dois para descobrir o que o teste pega.
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ListView(
            children: [
              const SizedBox(height: 200),
              // `Center` é obrigatório: o ListView impõe largura RÍGIDA do
              // viewport aos filhos, e sem ele o card viraria 800pt de largura
              // — logo 1025pt de altura — com o centro fora da tela, e o
              // gesto não acertaria nada.
              Center(child: SizedBox(width: cardWidth, child: card())),
              const SizedBox(height: 900),
            ],
          ),
        ),
      ),
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(CompeteHubMenuCard)),
    );
    await tester.pump(const Duration(milliseconds: 16));
    await gesture.moveBy(const Offset(0, -80));
    await tester.pump();

    expect(scaleOf(tester), 1);

    await gesture.up();
    await tester.pumpAndSettle();
  });
}
