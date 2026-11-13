import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_result_card.dart';

const art = BookingResultArtData(
  headline: 'Jogaço\nna areia.',
  duration: '1h30',
  dateLabel: 'SEX · 22 MAI',
  placeLabel: 'Arena Beach Sports Clube de Goiânia · Quadra Coberta 12',
);

ResultPlayer p(String id, String name) => ResultPlayer(id: id, name: name);

Future<void> pintar(
  WidgetTester tester,
  BookingResult result, {
  BookingStoryTheme theme = BookingStoryTheme.night,
}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: BookingResultCard(
        result: result,
        art: art,
        theme: theme,
        infos: BookingResultInfo.values.toSet(),
      ),
    ),
  );
}

void main() {
  testWidgets('duas duplas com cinco sets e nomes longos cabem na arte', (
    tester,
  ) async {
    final result = BookingResult(
      teams: [
        ResultTeam(
          id: 0,
          players: [p('u1', 'Maria Alves'), p('u2', 'Enzo Lima')],
          customName: 'As lendas da areia do setor bueno',
        ),
        ResultTeam(id: 1, players: [p('u3', 'Rafa'), p('u4', 'Lia')]),
      ],
      games: [
        for (var i = 0; i < 7; i++)
          ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 + i),
      ],
    );

    await pintar(tester, result);

    expect(tester.takeException(), isNull);
    // Mais de cinco sets não cabem em colunas: vão todos para a grade.
    expect(find.text('7'), findsOneWidget);
    expect(find.byKey(const Key('booking-result-games-grid')), findsOneWidget);
    expect(find.text('SETS · 7'), findsOneWidget);
    expect(find.text('S7'), findsOneWidget);
    expect(find.text('21–16'), findsOneWidget);
  });

  testWidgets('até cinco sets: placar em colunas, sem grade', (tester) async {
    final result = BookingResult(
      teams: [
        ResultTeam(id: 0, players: [p('u1', 'Maria'), p('u2', 'Enzo')]),
        ResultTeam(id: 1, players: [p('u3', 'Caio'), p('u4', 'Lia')]),
      ],
      games: const [
        ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 18),
        ResultGame(teamA: 0, teamB: 1, scoreA: 17, scoreB: 21),
        ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 12),
      ],
    );

    await pintar(tester, result);

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('booking-result-games-grid')), findsNothing);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('17'), findsOneWidget);
  });

  testWidgets(
      'rei da quadra: placar de cada jogo na grade, com o excesso '
      'contado', (tester) async {
    var result = BookingResult(
      teams: [
        for (var t = 0; t < 3; t++)
          ResultTeam(
            id: t,
            players: [p('a$t', 'Atleta $t'), p('b$t', 'Par $t'), p('c$t', 'X')],
          ),
      ],
      games: const [],
    );
    for (var i = 0; i < 7; i++) {
      result = result.addGame();
      final g = result.games.last;
      result = result.updateGame(i, g.copyWith(scoreA: 2, scoreB: i % 2));
    }

    for (final theme in BookingStoryTheme.values) {
      await pintar(tester, result, theme: theme);
      expect(tester.takeException(), isNull, reason: theme.name);
    }
    expect(find.text('JOGOS · 7'), findsOneWidget);
    expect(find.text('J6'), findsOneWidget);
    expect(find.text('J7'), findsNothing);
    expect(find.text('+1 jogo no app'), findsOneWidget);
    expect(find.text('2–1'), findsNWidgets(3));
  });

  testWidgets('rei da quadra com 4+ times na classificação: grade menor',
      (tester) async {
    var result = BookingResult(
      teams: [
        for (var t = 0; t < 5; t++)
          ResultTeam(
            id: t,
            players: [p('a$t', 'Atleta $t'), p('b$t', 'Par $t')],
          ),
      ],
      games: const [],
    );
    for (var i = 0; i < 9; i++) {
      result = result.addGame();
      result = result.updateGame(
        i,
        result.games.last.copyWith(scoreA: 15, scoreB: 10 + i % 4),
      );
    }

    await pintar(tester, result);

    expect(tester.takeException(), isNull);
    expect(find.text('J4'), findsOneWidget);
    expect(find.text('J5'), findsNothing);
    expect(find.text('+5 jogos no app'), findsOneWidget);
  });

  testWidgets('rotação com seis times: só os quatro primeiros', (tester) async {
    var result = BookingResult(
      teams: [
        for (var t = 0; t < 6; t++)
          ResultTeam(
              id: t, players: [p('a$t', 'Atleta $t'), p('b$t', 'Par $t')]),
      ],
      games: const [ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 9)],
    );
    result = result.addGame();

    await pintar(tester, result);

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Atleta'), findsNWidgets(4));
  });
}
