import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  Widget wrap(Widget child) {
    return ProviderScope(
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: child),
      ),
    );
  }

  OrganizerMatchRow row(TournamentMatch match) => OrganizerMatchRow(match: match);

  testWidgets('live card shows AO VIVO badge and current set scores', (tester) async {
    final match = TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'MASC OPEN',
      round: 3,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
      teamADescription: 'Marcos / Victor',
      teamBDescription: 'Igor / João',
      courtId: 'Q1',
      scheduleTime: DateTime(2026, 6, 16, 9),
      liveElapsedSec: 1450,
      servingTeamId: 'a',
      currentSetIndex: 1,
      sets: const [
        TournamentMatchSet(a: 21, b: 17),
        TournamentMatchSet(a: 18, b: 16),
      ],
    );

    await tester.pumpWidget(wrap(OrganizerMatchCard(row: row(match))));
    expect(find.text('AO VIVO'), findsOneWidget);
    expect(find.textContaining('JOGO #1'), findsOneWidget);
    expect(find.text('Marcos / Victor'), findsOneWidget);
    expect(find.text('Igor / João'), findsOneWidget);
    expect(find.text('18'), findsWidgets);
    expect(find.text('16'), findsWidgets);
    expect(find.text('# Q1'), findsOneWidget);
    expect(find.text('09:00'), findsOneWidget);
    expect(find.text('24:10'), findsOneWidget);
  });

  testWidgets('scheduled card shows AGENDADA and queue hint', (tester) async {
    final match = TournamentMatch(
      id: 'm2',
      tournamentId: 't1',
      categoryId: 'MASC OPEN',
      round: 3,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 2,
      teamADescription: 'André / Gabriel',
      teamBDescription: 'Felipe / Mateus',
      courtId: 'Q1',
      scheduleTime: DateTime(2026, 6, 16, 9, 50),
      queueStatus: 'waiting',
    );

    await tester.pumpWidget(wrap(OrganizerMatchCard(row: row(match))));
    expect(find.text('AGENDADA'), findsOneWidget);
    expect(find.text('Após Q1 atual'), findsOneWidget);
    expect(find.text('09:50'), findsOneWidget);
    expect(find.textContaining('JOGO #2'), findsOneWidget);
    expect(find.text('André / Gabriel'), findsOneWidget);
    expect(find.text('Felipe / Mateus'), findsOneWidget);
  });

  testWidgets('unscheduled card shows A PROGRAMAR and Sem quadra', (tester) async {
    final match = TournamentMatch(
      id: 'm3',
      tournamentId: 't1',
      categoryId: 'MISTO B',
      round: 2,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 6,
      teamADescription: 'Pedro / Lucas',
      teamBDescription: 'André / Gabriel',
    );

    await tester.pumpWidget(wrap(OrganizerMatchCard(row: row(match))));
    expect(find.text('A PROGRAMAR'), findsOneWidget);
    expect(find.text('Sem quadra —'), findsOneWidget);
  });

  testWidgets('finished card shows ENCERRADA and sets won', (tester) async {
    final match = TournamentMatch(
      id: 'm4',
      tournamentId: 't1',
      categoryId: 'MASC OPEN',
      round: 2,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.completed,
      resultA: '2',
      resultB: '0',
      isGroupMatch: false,
      matchNumber: 8,
      teamADescription: 'Igor / João',
      teamBDescription: 'Bruno / Caio',
      courtId: 'Q1',
      scheduleTime: DateTime(2026, 6, 16, 8, 10),
      sets: const [
        TournamentMatchSet(a: 21, b: 14),
        TournamentMatchSet(a: 21, b: 18),
      ],
    );

    await tester.pumpWidget(wrap(OrganizerMatchCard(row: row(match))));
    expect(find.text('ENCERRADA'), findsOneWidget);
    expect(find.textContaining('JOGO #8'), findsOneWidget);
    expect(find.text('Igor / João'), findsOneWidget);
    expect(find.text('Bruno / Caio'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('0'), findsOneWidget);
    expect(find.text('08:10'), findsOneWidget);
  });

  testWidgets('uses profile photo when enrichment provides avatar url', (
    tester,
  ) async {
    final match = TournamentMatch(
      id: 'm5',
      tournamentId: 't1',
      categoryId: 'MASC OPEN',
      round: 1,
      matchType: 'wb',
      poolId: '',
      teamAId: 'team-a',
      teamBId: 'team-b',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
      teamADescription: 'Marcos / Victor',
      teamBDescription: 'Igor / João',
    );
    final enriched = TournamentMatchCardViewModel(
      match: match,
      teamA: TournamentMatchCardTeamViewModel(
        displayName: 'Marcos / Victor',
        players: const [
          TournamentMatchCardPlayerViewModel(
            initials: 'MA',
            avatarColor: Color(0xFF8B5A2B),
            avatarUrl: 'https://example.com/marcos.jpg',
          ),
          TournamentMatchCardPlayerViewModel(
            initials: 'VI',
            avatarColor: Color(0xFF2F4A8C),
            avatarUrl: 'https://example.com/victor.jpg',
          ),
        ],
      ),
      teamB: TournamentMatchCardTeamViewModel(
        displayName: 'Igor / João',
        players: const [
          TournamentMatchCardPlayerViewModel(
            initials: 'IG',
            avatarColor: Color(0xFF2E7D32),
          ),
          TournamentMatchCardPlayerViewModel(
            initials: 'JO',
            avatarColor: Color(0xFF6B4E9A),
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      wrap(
        OrganizerMatchCard(
          row: row(match),
          enriched: enriched,
        ),
      ),
    );

    expect(
      find.byWidgetPredicate(
        (w) =>
            w.runtimeType.toString() == 'CachedNetworkImage' &&
            (w as dynamic).imageUrl == 'https://example.com/marcos.jpg',
      ),
      findsOneWidget,
    );
    expect(
      find.byWidgetPredicate(
        (w) =>
            w.runtimeType.toString() == 'CachedNetworkImage' &&
            (w as dynamic).imageUrl == 'https://example.com/victor.jpg',
      ),
      findsOneWidget,
    );
  });
}
