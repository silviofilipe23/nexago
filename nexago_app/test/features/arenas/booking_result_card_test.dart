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

Future<void> pintar(WidgetTester tester, BookingResult result) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: BookingResultCard(
        result: result,
        art: art,
        theme: BookingStoryTheme.night,
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
    // Só os cinco primeiros sets entram, e os 7 vencidos aparecem no total.
    expect(find.text('7'), findsOneWidget);
    expect(find.text('21'), findsNWidgets(BookingResultCard.maxSetColumns));
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
