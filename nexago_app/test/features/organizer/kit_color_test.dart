import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/mesa_sun/mesa_sun.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_kit_color_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_mesa.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_start_serve.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_kit_color.dart';

class _SunOn extends MesaSunModeNotifier {
  @override
  bool build() => true;
}

void main() {
  group('KitColors', () {
    test('catálogo: 6 cores, sem laranja, ids únicos', () {
      expect(KitColors.all, hasLength(6));
      expect(KitColors.all.map((c) => c.id).toSet(), hasLength(6));
      expect(
        KitColors.all.any((c) => c.hex == const Color(0xFFFF6A1A)),
        isFalse,
      );
    });

    test('padrão: azul pra A, amarelo pra B; id desconhecido cai no padrão',
        () {
      expect(KitColors.forSide('A').id, 'blue');
      expect(KitColors.forSide('B').id, 'yellow');
      expect(KitColors.forSide('A', idA: 'lixo').id, 'blue');
      expect(KitColors.forSide('B', idB: 'red').id, 'red');
      expect(KitColors.byId(null), isNull);
    });

    test('A escolhe a cor de B: as duas trocam', () {
      final next = KitColors.pick(
        side: 'A',
        chosen: KitColors.yellow,
        currentA: KitColors.blue,
        currentB: KitColors.yellow,
      );
      expect(next.a.id, 'yellow');
      expect(next.b.id, 'blue');
    });

    test('B escolhe a cor de A: as duas trocam', () {
      final next = KitColors.pick(
        side: 'B',
        chosen: KitColors.blue,
        currentA: KitColors.blue,
        currentB: KitColors.yellow,
      );
      expect(next.a.id, 'yellow');
      expect(next.b.id, 'blue');
    });

    test('cor livre: só a dupla escolhida muda', () {
      final next = KitColors.pick(
        side: 'B',
        chosen: KitColors.green,
        currentA: KitColors.blue,
        currentB: KitColors.yellow,
      );
      expect(next.a.id, 'blue');
      expect(next.b.id, 'green');
    });

    test('mapper lê kitColorA/B da partida; ausentes ficam nulos', () {
      final base = {
        'tournamentId': 't',
        'categoryId': 'c',
        'teamAId': 'a',
        'teamBId': 'b',
        'status': 'scheduled',
      };
      final withColors = TournamentMatchMapper.fromMap('m1', {
        ...base,
        'kitColorA': 'red',
        'kitColorB': 'white',
      });
      expect(withColors.kitColorA, 'red');
      expect(withColors.kitColorB, 'white');
      final legacy = TournamentMatchMapper.fromMap('m2', base);
      expect(legacy.kitColorA, isNull);
    });
  });

  void setSize(WidgetTester tester, Size size) {
    // `setSurfaceSize` não atualiza o MediaQuery: a view física sim.
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  LiveTableTeamData team(String label, String p1, String p2) =>
      LiveTableTeamData(
        label: label,
        player1: OrganizerCategoryPlayerInfo(uid: 'u-$p1', name: p1),
        player2: OrganizerCategoryPlayerInfo(uid: 'u-$p2', name: p2),
      );

  group('passo 3 · cor da camisa', () {
    Future<List<LiveTableStartConfig>> pumpStart(
      WidgetTester tester, {
      bool sun = false,
    }) async {
      final confirmed = <LiveTableStartConfig>[];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            if (sun) mesaSunModeProvider.overrideWith(_SunOn.new),
          ],
          child: MaterialApp(
            home: MesaSunScope(
              child: Scaffold(
                body: LiveTableStartServeScreen(
                  teamA: team('Daniel / Gabriel', 'Daniel', 'Gabriel'),
                  teamB: team('Vinícius / Thiago', 'Vinícius', 'Thiago'),
                  courtLabel: 'Q1',
                  onBack: () {},
                  onConfirm: confirmed.add,
                ),
              ),
            ),
          ),
        ),
      );
      return confirmed;
    }

    testWidgets('começa em azul (A) e amarelo (B), com o nome da cor escrito', (
      tester,
    ) async {
      setSize(tester, const Size(390, 844));
      await pumpStart(tester);
      expect(find.text('3 · COR DA CAMISA'), findsOneWidget);
      expect(find.text('4 · LADO INICIAL (VISTA DA MESA)'), findsOneWidget);
      expect(find.text('Azul'), findsOneWidget);
      expect(find.text('Amarelo'), findsOneWidget);
    });

    testWidgets('escolher a cor da outra dupla troca as duas', (tester) async {
      setSize(tester, const Size(390, 844));
      await pumpStart(tester);

      await tester.tap(find.byKey(const ValueKey('kit-A-yellow')));
      await tester.pump();
      // Nunca duas duplas na mesma cor: A virou amarelo, B virou azul.
      expect(find.text('Amarelo'), findsOneWidget);
      expect(find.text('Azul'), findsOneWidget);
    });

    testWidgets('a cor escolhida vai na confirmação do set', (tester) async {
      setSize(tester, const Size(390, 844));
      final confirmed = await pumpStart(tester);

      await tester.tap(find.byKey(const ValueKey('kit-B-green')));
      await tester.tap(find.byKey(const ValueKey('kit-A-red')));
      await tester.pump();
      await tester.tap(find.textContaining('Vinícius / Thiago').first);
      await tester.pump();
      await tester.tap(find.textContaining('Começar set'));
      await tester.pump();

      expect(confirmed, hasLength(1));
      expect(confirmed.single.kitA.id, 'red');
      expect(confirmed.single.kitB.id, 'green');
    });

    testWidgets('amostra tem toque de pelo menos 44px', (tester) async {
      setSize(tester, const Size(390, 844));
      await pumpStart(tester);
      final size = tester.getSize(find.byKey(const ValueKey('kit-A-blue')));
      expect(size.width, greaterThanOrEqualTo(44));
      expect(size.height, greaterThanOrEqualTo(44));
    });

    for (final sun in [false, true]) {
      testWidgets(
          'cabe sem rolagem em 390×844 (${sun ? 'sol' : 'normal'}) com '
          'status bar e home indicator', (tester) async {
        setSize(tester, const Size(390, 844));
        tester.view.padding = const FakeViewPadding(top: 47, bottom: 34);
        tester.view.viewPadding = const FakeViewPadding(top: 47, bottom: 34);
        await pumpStart(tester, sun: sun);

        expect(tester.takeException(), isNull);
        final scrollable = tester.state<ScrollableState>(
          find.byType(Scrollable).first,
        );
        expect(scrollable.position.maxScrollExtent, 0);
        // O botão "Começar set" fica por inteiro dentro da tela.
        final cta = tester.getRect(find.textContaining('Escolha quem saca'));
        expect(cta.bottom, lessThanOrEqualTo(844 - 34));
      });
    }
  });

  group('tela do jogo', () {
    Widget mesa({
      required KitColor topKit,
      required KitColor bottomKit,
      String topLabel = 'Vinícius / Thiago',
      String bottomLabel = 'Daniel / Gabriel',
      bool sun = false,
    }) {
      return ProviderScope(
        overrides: [if (sun) mesaSunModeProvider.overrideWith(_SunOn.new)],
        child: MaterialApp(
          home: MesaSunScope(
            child: Scaffold(
              body: LiveTableMesaScreen(
                courtLabel: 'Q1',
                titleLabel: 'Masc Open',
                elapsedLabel: '06:39',
                setLabel: 'SET 1',
                top: LiveTableMesaTeam(
                  label: topLabel,
                  score: '20',
                  isServing: true,
                  onTap: () {},
                  onMinus: () {},
                  kit: topKit,
                ),
                bottom: LiveTableMesaTeam(
                  label: bottomLabel,
                  score: '6',
                  isServing: false,
                  onTap: () {},
                  onMinus: () {},
                  kit: bottomKit,
                ),
                net: LiveTableMesaNet(
                  setPointTeam: topLabel,
                  setPointKit: topKit,
                  interval: 7,
                  total: 26,
                ),
                enabled: true,
                onBack: () {},
                onMore: () {},
                onUndo: () {},
                onTimeout: () {},
              ),
            ),
          ),
        ),
      );
    }

    double stripTop(WidgetTester tester, KitColor kit) {
      final strip = find.byWidgetPredicate(
        (w) => w is KitStrip && w.color.id == kit.id,
      );
      expect(strip, findsOneWidget);
      return tester.getTopLeft(strip).dy;
    }

    testWidgets('faixa de 8px no topo de cada metade, de ponta a ponta', (
      tester,
    ) async {
      setSize(tester, const Size(390, 780));
      await tester.pumpWidget(
        mesa(topKit: KitColors.yellow, bottomKit: KitColors.blue),
      );
      expect(tester.takeException(), isNull);

      final strip = find.byWidgetPredicate(
        (w) => w is KitStrip && w.color.id == 'yellow',
      );
      expect(tester.getSize(strip).height, 8);
      expect(tester.getSize(strip).width, 390);
      expect(stripTop(tester, KitColors.yellow),
          lessThan(stripTop(tester, KitColors.blue)));
    });

    testWidgets('na troca de lado a faixa vai junto com a dupla', (
      tester,
    ) async {
      setSize(tester, const Size(390, 780));
      await tester.pumpWidget(
        mesa(topKit: KitColors.yellow, bottomKit: KitColors.blue),
      );
      final before = stripTop(tester, KitColors.blue);

      // Lados trocados: a dupla azul agora fica em cima.
      await tester.pumpWidget(
        mesa(
          topKit: KitColors.blue,
          bottomKit: KitColors.yellow,
          topLabel: 'Daniel / Gabriel',
          bottomLabel: 'Vinícius / Thiago',
        ),
      );
      expect(stripTop(tester, KitColors.blue), lessThan(before));
      expect(
        stripTop(tester, KitColors.blue),
        lessThan(stripTop(tester, KitColors.yellow)),
      );
    });

    testWidgets('o nome da cor aparece por escrito (retrato) e no aviso', (
      tester,
    ) async {
      setSize(tester, const Size(390, 780));
      await tester.pumpWidget(
        mesa(topKit: KitColors.yellow, bottomKit: KitColors.blue),
      );
      expect(find.textContaining('CAMISA AMARELO'), findsOneWidget);
      expect(find.textContaining('CAMISA AZUL'), findsOneWidget);
      // Aviso de set point leva o quadradinho da camisa de quem está na frente.
      expect(
        find.byWidgetPredicate(
          (w) => w is KitSquare && w.color.id == 'yellow',
        ),
        findsWidgets,
      );
    });

    testWidgets('paisagem escreve o nome da cor sob o nome da dupla', (
      tester,
    ) async {
      setSize(tester, const Size(844, 390));
      await tester.pumpWidget(
        mesa(topKit: KitColors.yellow, bottomKit: KitColors.blue),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('CAMISA AMARELO'), findsOneWidget);
      expect(find.text('CAMISA AZUL'), findsOneWidget);
    });

    for (final kit in [KitColors.white, KitColors.black]) {
      for (final sun in [false, true]) {
        testWidgets(
          '${kit.label} fica visível com contorno (${sun ? 'Modo Sol' : 'tema normal'})',
          (tester) async {
            setSize(tester, const Size(390, 780));
            await tester.pumpWidget(
              mesa(topKit: kit, bottomKit: KitColors.blue, sun: sun),
            );
            final strip = find.byWidgetPredicate(
              (w) => w is KitStrip && w.color.id == kit.id,
            );
            final borders = tester
                .widgetList<Container>(
                  find.descendant(of: strip, matching: find.byType(Container)),
                )
                .map((c) => (c.decoration as BoxDecoration?)?.border)
                .whereType<Border>()
                .toList();
            expect(borders, isNotEmpty);
            if (sun) {
              // Modo Sol: 2px preto.
              expect(borders.first.top.width, 2);
              expect(borders.first.top.color, MesaSun.ink);
            } else {
              // Tema escuro: 1,5px escuro por dentro (e anel claro por fora).
              expect(borders.first.top.width, 1.5);
              expect(borders.first.top.color, const Color(0xFF151517));
            }
          },
        );
      }
    }
  });
}
