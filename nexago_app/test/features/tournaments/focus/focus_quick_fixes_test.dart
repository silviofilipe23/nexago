import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_views_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_grupo_section.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_day_rail.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_now_hero.dart';

Widget _wrap(Widget child, {bool screenReader = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(accessibleNavigation: screenReader),
        child: Scaffold(body: child),
      ),
    );

TournamentPoolStandingsGroup _group(String id) => TournamentPoolStandingsGroup(
      poolId: id,
      poolLabel: 'Grupo $id',
      rows: const [],
      teamCount: 4,
      matchCount: 6,
      isComplete: false,
    );

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('spokenScoreLine', () {
    test('troca traços e o ponto do meio por fala', () {
      expect(spokenScoreLine('21-15 · 2º set 12-9'), '21 a 15, 2º set 12 a 9');
      expect(
        spokenScoreLine('1–0 · 2º set 5-4 · 40-15'),
        '1 a 0, 2º set 5 a 4, 40 a 15',
      );
      expect(
        spokenScoreLine('1–1 · super tie-break 7-5'),
        '1 a 1, super tie-break 7 a 5',
      );
    });
  });

  group('VER TODOS da faixa do dia', () {
    testWidgets('com ação: botão de verdade, alvo de 44 e nome',
        (tester) async {
      final semantics = tester.ensureSemantics();
      var taps = 0;
      await tester.pumpWidget(
        _wrap(
          FocusDayRail(items: const [], onOpen: (_) {}, onSeeAll: () => taps++),
        ),
      );

      final button = find.byKey(const Key('focus-day-rail-see-all'));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(44));
      expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
      expect(find.text('VER TODOS >'), findsNothing);
      expect(
        find.bySemanticsLabel('Ver todas as suas partidas'),
        findsOneWidget,
      );

      await tester.tap(button);
      expect(taps, 1);
      semantics.dispose();
    });

    testWidgets('sem ação, nada de botão (como hoje no Agora)', (tester) async {
      await tester.pumpWidget(
        _wrap(FocusDayRail(items: const [], onOpen: (_) {})),
      );
      expect(find.byKey(const Key('focus-day-rail-see-all')), findsNothing);
    });
  });

  testWidgets('abas de grupo: botão, selecionada, "o seu" e alvo de 44',
      (tester) async {
    final semantics = tester.ensureSemantics();
    int? chosen;
    await tester.pumpWidget(
      _wrap(
        FocusStandingsGroupChips(
          groups: [_group('A'), _group('B')],
          selectedIndex: 0,
          athletePoolId: 'A',
          onSelected: (i) => chosen = i,
        ),
      ),
    );

    final tabA = find.byKey(const ValueKey('focus-group-tab-A'));
    expect(
      tester.getSemantics(tabA),
      containsSemantics(
        label: 'Grupo A, o seu',
        isButton: true,
        isSelected: true,
      ),
    );
    expect(
      tester.getSemantics(find.byKey(const ValueKey('focus-group-tab-B'))),
      containsSemantics(label: 'Grupo B', isButton: true, isSelected: false),
    );
    expect(tester.getSize(tabA).height, greaterThanOrEqualTo(44));

    await tester.tap(find.byKey(const ValueKey('focus-group-tab-B')));
    expect(chosen, 1);
    semantics.dispose();
  });

  group('placar da partida do atleta', () {
    late List<Map<Object?, Object?>> announced;

    setUp(() {
      announced = [];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockDecodedMessageHandler<Object?>(SystemChannels.accessibility,
              (message) async {
        final map = message as Map<Object?, Object?>;
        if (map['type'] == 'announce') announced.add(map);
        return null;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockDecodedMessageHandler<Object?>(
              SystemChannels.accessibility, null);
    });

    Widget headline(String score, {bool screenReader = true}) => _wrap(
          FocusHeroHeadline(
            contextTag: 'MISTO B',
            checkedIn: false,
            live: true,
            scheduleTime: null,
            liveScoreLine: score,
            accent: Colors.orange,
          ),
          screenReader: screenReader,
        );

    testWidgets('lê o placar por extenso, não soletrado', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(headline('1–0 · 2º set 5-4'));

      expect(
        find.bySemanticsLabel('Placar: 1 a 0, 2º set 5 a 4'),
        findsOneWidget,
      );
      semantics.dispose();
    });

    testWidgets('com leitor de tela ligado, anuncia quando o placar muda',
        (tester) async {
      await tester.pumpWidget(headline('1–0 · 2º set 5-4'));
      await tester.pumpWidget(headline('1–0 · 2º set 6-4'));

      expect(announced, hasLength(1));
      final data = announced.single['data'] as Map<Object?, Object?>;
      expect(data['message'], 'Placar: 1 a 0, 2º set 6 a 4');
    });

    testWidgets('sem leitor de tela, não anuncia nada', (tester) async {
      await tester.pumpWidget(
        headline('1–0 · 2º set 5-4', screenReader: false),
      );
      await tester.pumpWidget(
        headline('1–0 · 2º set 6-4', screenReader: false),
      );

      expect(announced, isEmpty);
    });
  });
}
