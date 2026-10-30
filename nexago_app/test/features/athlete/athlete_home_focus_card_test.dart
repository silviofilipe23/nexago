import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_focus_card_logic.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_focus_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String status = TournamentMatchStatus.scheduled,
  String queueStatus = '',
  DateTime? scheduleTime,
  String? courtName = '3',
  int matchNumber = 14,
  String matchType = 'group',
}) =>
    TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: matchType,
      poolId: 'B',
      teamAId: 'eu',
      teamBId: 'eles',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: matchNumber,
      scheduleTime: scheduleTime,
      courtName: courtName,
      queueStatus: queueStatus,
    );

const _opponent = TournamentMatchCardTeamViewModel(
  displayName: 'Rafa & Leo',
  players: [
    TournamentMatchCardPlayerViewModel(
        initials: 'RM', avatarColor: Colors.teal),
    TournamentMatchCardPlayerViewModel(
        initials: 'LT', avatarColor: Colors.purple),
  ],
);

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('homeFocusCardModeOf', () {
    test('sem partida pendente: intervalo', () {
      expect(homeFocusCardModeOf(null), HomeFocusCardMode.waiting);
      expect(
        homeFocusCardModeOf(_match(status: TournamentMatchStatus.completed)),
        HomeFocusCardMode.waiting,
      );
    });

    test('ao vivo vence a chamada que ficou marcada', () {
      expect(
        homeFocusCardModeOf(
          _match(
            status: TournamentMatchStatus.inProgress,
            queueStatus: 'on_court',
          ),
        ),
        HomeFocusCardMode.live,
      );
    });

    test('chamada, contagem e fila', () {
      expect(
        homeFocusCardModeOf(_match(queueStatus: 'on_court')),
        HomeFocusCardMode.called,
      );
      expect(
        homeFocusCardModeOf(_match(scheduleTime: DateTime(2026, 10, 30, 15))),
        HomeFocusCardMode.countdown,
      );
      expect(
        homeFocusCardModeOf(_match(queueStatus: 'waiting')),
        HomeFocusCardMode.unscheduled,
      );
    });
  });

  test('homeFocusMatchMeta junta só o que existe', () {
    expect(homeFocusMatchMeta(_match()), 'Jogo 14 · Quadra 3');
    expect(homeFocusMatchMeta(_match(courtName: null, matchNumber: 0)), '');
  });

  test('barra só na última hora', () {
    final now = DateTime(2026, 10, 30, 12);
    expect(homeFocusFinalHourProgress(null, now), isNull);
    expect(
      homeFocusFinalHourProgress(now.add(const Duration(hours: 2)), now),
      isNull,
    );
    expect(
      homeFocusFinalHourProgress(now.add(const Duration(minutes: 15)), now),
      closeTo(0.75, 0.001),
    );
    expect(
      homeFocusFinalHourProgress(now.subtract(const Duration(minutes: 5)), now),
      1,
    );
  });

  group('card', () {
    Future<int Function()> pump(
      WidgetTester tester,
      TournamentMatch? match, {
      TournamentMatchCardTeamViewModel? opponent = _opponent,
      double width = 390,
    }) async {
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: width,
                child: AthleteHomeFocusCardBody(
                  tournamentName: 'Open Goiânia Beach',
                  match: match,
                  opponent: opponent,
                  onOpen: () => taps++,
                ),
              ),
            ),
          ),
        ),
      );
      return () => taps;
    }

    testWidgets('contagem: relógio, adversário, quadra e entrar', (
      tester,
    ) async {
      final taps = await pump(
        tester,
        _match(
          scheduleTime: DateTime.now().add(
            const Duration(minutes: 42, seconds: 30),
          ),
        ),
      );

      expect(find.byKey(const ValueKey('home-focus-card-countdown')), findsOne);
      expect(find.text('SUA PRÓXIMA PARTIDA EM'), findsOneWidget);
      expect(find.textContaining(RegExp(r'^4[12]:\d\d$')), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('vs Rafa & Leo'), findsOneWidget);
      expect(find.textContaining('Jogo 14 · Quadra 3 · '), findsOneWidget);

      await tester.tap(find.text('ENTRAR NO FOCUS'));
      expect(taps(), 1);
    });

    testWidgets('a contagem anda sozinha', (tester) async {
      await pump(
        tester,
        _match(scheduleTime: DateTime.now().add(const Duration(minutes: 30))),
      );
      String clock() => tester
          .widgetList<Text>(find.textContaining(RegExp(r'^\d\d:\d\d$')))
          .single
          .data!;
      final before = clock();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 1100)),
      );
      await tester.pump(const Duration(seconds: 1));
      expect(clock(), isNot(before));
    });

    testWidgets('passou do horário: atraso, sem barra', (tester) async {
      await pump(
        tester,
        _match(
          scheduleTime: DateTime.now().subtract(const Duration(minutes: 20)),
        ),
      );
      expect(find.text('SUA PARTIDA ESTÁ ATRASADA'), findsOneWidget);
      expect(find.text('20 min'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });

    testWidgets('chamado pela mesa: manda para a quadra', (tester) async {
      final taps = await pump(tester, _match(queueStatus: 'on_court'));
      expect(find.text('CHAMADO PELA MESA'), findsOneWidget);
      expect(find.text('Vá para a Quadra 3 agora'), findsOneWidget);
      expect(find.textContaining('contra Rafa & Leo'), findsOneWidget);
      await tester.tap(find.text('ESTOU INDO'));
      expect(taps(), 1);
    });

    testWidgets('ao vivo', (tester) async {
      await pump(tester, _match(status: TournamentMatchStatus.inProgress));
      expect(find.text('AO VIVO'), findsOneWidget);
      expect(find.text('Sua partida está rolando'), findsOneWidget);
      expect(find.text('ABRIR MODO FOCUS'), findsOneWidget);
    });

    testWidgets('fila sem horário e sem adversário definido', (tester) async {
      await pump(tester, _match(queueStatus: 'waiting'), opponent: null);
      expect(find.text('Aguardando horário da mesa'), findsOneWidget);
      expect(find.text('Adversário a definir'), findsOneWidget);
    });

    testWidgets('intervalo: sem partida, ainda leva ao Focus', (tester) async {
      final taps = await pump(tester, null, opponent: null);
      expect(find.text('Sem partida marcada agora'), findsOneWidget);
      await tester.tap(find.text('ABRIR MODO FOCUS'));
      expect(taps(), 1);
    });

    testWidgets('não estoura em tela estreita', (tester) async {
      await pump(
        tester,
        _match(
          scheduleTime: DateTime.now().add(const Duration(hours: 3)),
        ),
        width: 288,
      );
      expect(tester.takeException(), isNull);
      await pump(tester, _match(queueStatus: 'on_court'), width: 288);
      expect(tester.takeException(), isNull);
    });
  });
}
