import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/nexa_duo_avatars.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/predictions/prediction_match_pick_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_match_card_premium_skin.dart';

TournamentMatchCardTeamViewModel _team(String name) =>
    TournamentMatchCardTeamViewModel(
      displayName: name,
      players: [
        TournamentMatchCardPlayerViewModel(
          initials: name.substring(0, 2).toUpperCase(),
          avatarColor: const Color(0xFF00FF88),
        ),
        TournamentMatchCardPlayerViewModel(
          initials: name.substring(0, 2).toUpperCase(),
          avatarColor: const Color(0xFFFF6B35),
        ),
      ],
    );

TournamentMatchCardViewModel _vm({
  String status = 'Scheduled',
  String matchType = 'WB',
  String resultA = '',
  String resultB = '',
  String winnerId = '',
}) {
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: 'm7',
      tournamentId: 't1',
      categoryId: 'cat-a',
      round: 1,
      matchType: matchType,
      poolId: '',
      teamAId: 'time-a',
      teamBId: 'time-b',
      status: status,
      resultA: resultA,
      resultB: resultB,
      isGroupMatch: false,
      matchNumber: 7,
      winnerId: winnerId,
    ),
    teamA: _team('Ana / Bia'),
    teamB: _team('Carla / Duda'),
  );
}

Widget _host(Widget child) => MaterialApp(
      home: MediaQuery(
        // O respiro/varredura da casca premium nunca deixa o pumpAndSettle assentar.
        data: const MediaQueryData(disableAnimations: true),
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  testWidgets('veste a casca compartilhada dos cards de partida',
      (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: null,
      locked: false,
    )));

    expect(find.byType(TournamentMatchCardSkin), findsOneWidget);
  });

  testWidgets('desenha as duas duplas com os avatares do card do Focus',
      (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: null,
      locked: false,
    )));

    expect(find.byType(NexaDuoAvatars), findsNWidgets(2));
    expect(find.text('Ana / Bia'), findsOneWidget);
    expect(find.text('Carla / Duda'), findsOneWidget);
  });

  testWidgets('o centro mostra "vs" enquanto dá para palpitar', (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: null,
      locked: false,
    )));

    expect(find.text('vs'), findsOneWidget);
  });

  testWidgets('depois de encerrada o centro vira o placar', (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(
        status: 'Completed',
        resultA: '21-15, 21-17',
        resultB: '15-21, 17-21',
        winnerId: 'time-a',
      ),
      selectedTeamId: null,
      locked: true,
    )));

    expect(find.text('2-0'), findsOneWidget);
    expect(find.text('vs'), findsNothing);
  });

  testWidgets('tocar num lado escolhe aquela dupla', (tester) async {
    String? picked;
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: null,
      locked: false,
      onSelect: (id) => picked = id,
    )));

    await tester.tap(find.text('Carla / Duda'));
    await tester.pump();

    expect(picked, 'time-b');
  });

  testWidgets('o lado escolhido fica marcado', (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: 'time-a',
      locked: false,
      onSelect: (_) {},
    )));

    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
  });

  testWidgets('partida travada não aceita palpite', (tester) async {
    var toques = 0;
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(status: 'InProgress'),
      selectedTeamId: null,
      locked: true,
      onSelect: (_) => toques++,
    )));

    await tester.tap(find.text('Ana / Bia'));
    await tester.pump();

    expect(toques, 0);
  });

  testWidgets('a final continua avisando que vale campeão', (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(matchType: 'Final'),
      selectedTeamId: null,
      locked: false,
    )));

    expect(find.text('VALE CAMPEÃO'), findsOneWidget);
  });

  testWidgets('o acerto continua visível depois do resultado', (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(
        status: 'Completed',
        resultA: '21-15, 21-17',
        resultB: '15-21, 17-21',
        winnerId: 'time-a',
      ),
      selectedTeamId: 'time-a',
      locked: true,
      wasCorrect: true,
    )));

    expect(find.text('VOCÊ ACERTOU'), findsOneWidget);
  });

  testWidgets('o cabeçalho traz o número da partida, como no Focus',
      (tester) async {
    await tester.pumpWidget(_host(PredictionMatchPickCard(
      viewModel: _vm(),
      selectedTeamId: null,
      locked: false,
    )));

    expect(find.text('#7'), findsOneWidget);
  });
}
