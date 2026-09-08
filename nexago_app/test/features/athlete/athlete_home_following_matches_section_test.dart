import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_following_matches_section.dart';
import 'package:nexago_app/features/tournaments/domain/followed_match.dart';
import 'package:nexago_app/features/tournaments/domain/followed_matches_providers.dart';

FollowedMatch followOf({
  required String matchId,
  String tournamentId = 't1',
}) {
  return FollowedMatch(
    matchId: matchId,
    tournamentId: tournamentId,
    categoryId: 'c1',
    source: 'manual',
    followedAt: DateTime.utc(2026, 10, 24),
  );
}

void main() {
  group('groupFollowedByTournament', () {
    test('junta as partidas do mesmo torneio num grupo só', () {
      // Um grupo por torneio = um listener por torneio. Sem agrupar seria um
      // listener por partida, repetido para partidas do mesmo torneio.
      final grouped = groupFollowedByTournament([
        followOf(matchId: 'm1'),
        followOf(matchId: 'm2'),
        followOf(matchId: 'm3', tournamentId: 't2'),
      ]);

      expect(grouped.keys, ['t1', 't2']);
      expect(grouped['t1']!.map((m) => m.matchId), ['m1', 'm2']);
      expect(grouped['t2']!.map((m) => m.matchId), ['m3']);
    });

    test('preserva a ordem de chegada dentro do grupo', () {
      final grouped = groupFollowedByTournament([
        followOf(matchId: 'recente'),
        followOf(matchId: 'antiga'),
      ]);

      expect(grouped['t1']!.map((m) => m.matchId), ['recente', 'antiga']);
    });

    test('descarta follow sem torneio: não há como carregar o card', () {
      final grouped = groupFollowedByTournament([
        followOf(matchId: 'm1', tournamentId: ''),
        followOf(matchId: 'm2'),
      ]);

      expect(grouped.keys, ['t1']);
      expect(grouped['t1']!.map((m) => m.matchId), ['m2']);
    });

    test('descarta follow sem matchId', () {
      final grouped = groupFollowedByTournament([followOf(matchId: '')]);

      expect(grouped, isEmpty);
    });

    test('lista vazia devolve mapa vazio', () {
      expect(groupFollowedByTournament(const []), isEmpty);
    });
  });

  group('AthleteHomeFollowingMatchesSection', () {
    Future<void> pump(
      WidgetTester tester,
      List<FollowedMatch> followed,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            followedMatchesProvider.overrideWith((ref) => Stream.value(followed)),
          ],
          child: const MaterialApp(
            home: Scaffold(body: AthleteHomeFollowingMatchesSection()),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('some inteira quando não há nada seguido', (tester) async {
      // É o estado da maioria dos atletas na maior parte do tempo: uma seção
      // vazia só empurraria o resto da home para baixo.
      await pump(tester, const []);

      expect(find.text('Acompanhando'), findsNothing);
    });

    testWidgets('some quando os follows não têm torneio', (tester) async {
      await pump(tester, [followOf(matchId: 'm1', tournamentId: '')]);

      expect(find.text('Acompanhando'), findsNothing);
    });
  });
}
