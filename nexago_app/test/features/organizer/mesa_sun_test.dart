import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/mesa_sun/mesa_sun.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_mesa.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_start_serve.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SunOn extends MesaSunModeNotifier {
  @override
  bool build() => true;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  LiveTableTeamData team(String label, String p1, String p2) =>
      LiveTableTeamData(
        label: label,
        player1: OrganizerCategoryPlayerInfo(uid: 'u-$p1', name: p1),
        player2: OrganizerCategoryPlayerInfo(uid: 'u-$p2', name: p2),
      );

  void setSize(WidgetTester tester, Size size) {
    // `setSurfaceSize` não atualiza o MediaQuery: a view física sim.
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  group('preferência', () {
    test('começa desligado e grava "sun"/"dark" por aparelho', () async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(mesaSunModeProvider), isFalse);
      await container.read(mesaSunModeProvider.notifier).toggle();
      expect(container.read(mesaSunModeProvider), isTrue);
      expect(
        (await SharedPreferences.getInstance()).getString(mesaThemePrefKey),
        'sun',
      );

      await container.read(mesaSunModeProvider.notifier).toggle();
      expect(
        (await SharedPreferences.getInstance()).getString(mesaThemePrefKey),
        'dark',
      );
    });

    test('lê "sun" salvo ao abrir a mesa', () async {
      SharedPreferences.setMockInitialValues({mesaThemePrefKey: 'sun'});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(mesaSunModeProvider);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(container.read(mesaSunModeProvider), isTrue);
    });

    test('"auto" (reservado) cai em modo normal', () async {
      SharedPreferences.setMockInitialValues({mesaThemePrefKey: 'auto'});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(mesaSunModeProvider);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(container.read(mesaSunModeProvider), isFalse);
    });
  });

  group('MesaSunScope', () {
    testWidgets('troca o tema sem recriar o que está dentro (estado fica)', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final key = GlobalKey<_CounterState>();
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: MesaSunScope(child: _Counter(key: key)),
          ),
        ),
      );
      key.currentState!.bump();
      await tester.pump();
      expect(find.text('1'), findsOneWidget);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(_Counter)),
      );
      expect(MesaSun.isOn(tester.element(find.byType(_Counter))), isFalse);
      await container.read(mesaSunModeProvider.notifier).set(true);
      await tester.pump();

      // O estado é o mesmo objeto: a partida (placar, saque) não é refeita.
      expect(key.currentState, isNotNull);
      expect(find.text('1'), findsOneWidget);
      expect(MesaSun.isOn(tester.element(find.byType(_Counter))), isTrue);
      expect(
        Theme.of(tester.element(find.byType(_Counter))).colorScheme.onSurface,
        MesaSun.ink,
      );
    });
  });

  group('mesa em Modo Sol', () {
    Future<void> pumpMesa(WidgetTester tester) {
      return tester.pumpWidget(
        ProviderScope(
          overrides: [mesaSunModeProvider.overrideWith(_SunOn.new)],
          child: MaterialApp(
            home: MesaSunScope(
              child: Scaffold(
                body: LiveTableMesaScreen(
                  courtLabel: 'Q1',
                  titleLabel: 'Masc Open · Fase de Grupos',
                  elapsedLabel: '06:39',
                  setLabel: 'SET 1',
                  top: LiveTableMesaTeam(
                    label: 'Vinícius / Thiago',
                    score: '20',
                    isServing: true,
                    onTap: () {},
                    onMinus: () {},
                    servingPlayerName: 'Vinícius',
                    onTapServingPlayer: () {},
                  ),
                  bottom: LiveTableMesaTeam(
                    label: 'Daniel / Gabriel',
                    score: '6',
                    isServing: false,
                    onTap: () {},
                    onMinus: () {},
                  ),
                  net: const LiveTableMesaNet(
                    setPointTeam: 'Vinícius',
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
        ),
      );
    }

    testWidgets('retrato: renderiza sem overflow e com fundo branco', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      setSize(tester, const Size(390, 780));
      await pumpMesa(tester);

      expect(tester.takeException(), isNull);
      expect(
        Theme.of(tester.element(find.byType(LiveTableMesaScreen)))
            .colorScheme
            .surfaceContainerLowest,
        MesaSun.white,
      );
      expect(find.textContaining('Saque · Vinícius'), findsOneWidget);
    });

    testWidgets('paisagem: o "−" não encosta no nome da dupla', (tester) async {
      SharedPreferences.setMockInitialValues({});
      setSize(tester, const Size(844, 390));
      await pumpMesa(tester);

      expect(tester.takeException(), isNull);
      final name = tester.getRect(find.text('Vinícius / Thiago'));
      final minus = tester.getRect(find.byIcon(Icons.remove_rounded).first);
      expect(name.overlaps(minus), isFalse);
    });
  });

  group('Quem começa sacando em Modo Sol', () {
    for (final size in const [Size(390, 780), Size(844, 390)]) {
      testWidgets(
          'renderiza sem overflow em ${size.width.toInt()}x'
          '${size.height.toInt()} e o ☀ desliga o modo', (tester) async {
        SharedPreferences.setMockInitialValues({});
        setSize(tester, size);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [mesaSunModeProvider.overrideWith(_SunOn.new)],
            child: MaterialApp(
              home: MesaSunScope(
                child: Scaffold(
                  body: LiveTableStartServeScreen(
                    teamA: team('Daniel / Gabriel', 'Daniel', 'Gabriel'),
                    teamB: team('Vinícius / Thiago', 'Vinícius', 'Thiago'),
                    courtLabel: 'Q1',
                    onBack: () {},
                    onConfirm: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        expect(find.byKey(const ValueKey('mesa-sun-toggle')), findsOneWidget);

        await tester.tap(find.byKey(const ValueKey('mesa-sun-toggle')));
        await tester.pump();
        expect(
          MesaSun.isOn(tester.element(find.byType(LiveTableStartServeScreen))),
          isFalse,
        );
      });
    }
  });
}

class _Counter extends StatefulWidget {
  const _Counter({super.key});

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  int value = 0;

  void bump() => setState(() => value++);

  @override
  Widget build(BuildContext context) => Text('$value');
}
