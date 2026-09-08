import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/followed_match.dart';
import 'package:nexago_app/features/tournaments/domain/followed_matches_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/follow_match_button.dart';

TournamentMatch matchWith(String status) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'bracket',
    poolId: '',
    teamAId: 'time-a',
    teamBId: 'time-b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
  );
}

FollowedMatch followOf(String matchId) {
  return FollowedMatch(
    matchId: matchId,
    tournamentId: 't1',
    categoryId: 'c1',
    source: 'manual',
    followedAt: DateTime.utc(2026, 10, 24),
  );
}

/// Sobrescreve a lista de seguidas para o teste não tocar em Firebase: sem
/// isso `followedMatchesProvider` cairia em `authProvider` e no Firestore real.
Future<void> pump(
  WidgetTester tester, {
  required TournamentMatch match,
  List<FollowedMatch> followed = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        followedMatchesProvider.overrideWith((ref) => Stream.value(followed)),
      ],
      child: MaterialApp(
        home: Scaffold(body: FollowMatchButton(match: match)),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('FollowMatchButton', () {
    testWidgets('some em partida encerrada', (tester) async {
      // Seguir jogo que acabou não faz sentido e ainda encheria
      // `followedMatches` de lixo que a varredura teria que limpar.
      await pump(tester, match: matchWith(TournamentMatchStatus.completed));

      expect(find.byType(TextButton), findsNothing);
      expect(find.text('Seguir'), findsNothing);
    });

    testWidgets('some em partida cancelada', (tester) async {
      await pump(tester, match: matchWith(TournamentMatchStatus.canceled));

      expect(find.byType(TextButton), findsNothing);
    });

    testWidgets('aparece em partida agendada', (tester) async {
      await pump(tester, match: matchWith(TournamentMatchStatus.scheduled));

      expect(find.text('Seguir'), findsOneWidget);
    });

    testWidgets('aparece em partida ao vivo', (tester) async {
      await pump(tester, match: matchWith(TournamentMatchStatus.inProgress));

      expect(find.text('Seguir'), findsOneWidget);
    });

    testWidgets('diz "Seguindo" quando a partida já está na lista',
        (tester) async {
      await pump(
        tester,
        match: matchWith(TournamentMatchStatus.inProgress),
        followed: [followOf('m1')],
      );

      expect(find.text('Seguindo'), findsOneWidget);
      expect(find.text('Seguir'), findsNothing);
    });

    testWidgets('follow de OUTRA partida não marca esta como seguida',
        (tester) async {
      await pump(
        tester,
        match: matchWith(TournamentMatchStatus.inProgress),
        followed: [followOf('m2')],
      );

      expect(find.text('Seguir'), findsOneWidget);
    });

    testWidgets('status legado in_progress também é seguível', (tester) async {
      // `TournamentMatchStatus.isInProgress` normaliza o legado snake_case; o
      // botão não pode sumir só porque o doc é antigo.
      await pump(tester, match: matchWith('in_progress'));

      expect(find.text('Seguir'), findsOneWidget);
    });
  });
}
