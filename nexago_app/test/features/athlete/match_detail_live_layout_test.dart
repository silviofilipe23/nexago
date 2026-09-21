import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_detail/match_detail_hero_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_detail/match_detail_live_actions.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_detail/match_detail_point_by_point_section.dart';

AthleteMatchDetail _detail({
  required MatchDetailPhase phase,
  String badge = 'AO VIVO',
  int ourSets = 0,
  int oppSets = 0,
  List<MatchSetScore> sets = const [],
  int? currentSetIndex,
  int? currentSetOurPoints,
  int? currentSetOpponentPoints,
}) {
  return AthleteMatchDetail(
    id: 'm1',
    phase: phase,
    result: AthleteMatchResult.win,
    resultBadgeLabel: badge,
    stageLabel: 'WB1',
    ourSetsWon: ourSets,
    opponentSetsWon: oppSets,
    ourTeam: const MatchTeamSide(
      teamId: 'a',
      label: 'Dupla A',
      roleLabel: 'VOCÊ',
      players: [],
    ),
    opponentTeam: const MatchTeamSide(
      teamId: 'b',
      label: 'Dupla B',
      roleLabel: '#17',
      players: [],
    ),
    sets: sets,
    currentSetIndex: currentSetIndex,
    currentSetOurPoints: currentSetOurPoints,
    currentSetOpponentPoints: currentSetOpponentPoints,
    tournamentName: 'Etapa',
    dateTimeLabel: 'Sáb 10:00',
    venueLabel: '',
    categoryLabel: '',
    durationLabel: '',
  );
}

void main() {
  test('formatLiveElapsed padroa mm:ss', () {
    expect(formatLiveElapsed(0), '00:00');
    expect(formatLiveElapsed(12), '00:12');
    expect(formatLiveElapsed(75), '01:15');
  });

  test('liveMatchDurationLabel usa matchStartedAt quando disponível', () {
    final started = DateTime(2026, 9, 16, 10, 0, 0);
    final now = DateTime(2026, 9, 16, 10, 1, 15);
    expect(
      liveMatchDurationLabel(
        matchStartedAt: started,
        liveElapsedSec: 999,
        now: now,
      ),
      '01:15',
    );
    expect(liveMatchDurationLabel(liveElapsedSec: 12), '00:12');
    expect(liveMatchDurationLabel(), '00:00');
  });

  testWidgets('ponto a ponto lista sets e placar final', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MatchDetailPointByPointSection(
              ourTeamHeader: 'Sua dupla',
              opponentTeamHeader: 'Adversário',
              groups: [
                MatchDetailPlayByPlayGroup(
                  setNumber: 1,
                  setIndex: 0,
                  finalScoreLabel: '21-18',
                  items: [
                    MatchDetailPlayByPlayItem(
                      isOurTeam: true,
                      time: '00:10',
                      setNumber: 1,
                      scoreLabel: '1-0',
                      teamLabel: 'Sua dupla',
                      description: 'Ponto',
                    ),
                    MatchDetailPlayByPlayItem(
                      isOurTeam: false,
                      time: '00:25',
                      setNumber: 1,
                      scoreLabel: '1-1',
                      teamLabel: 'Adversário',
                      description: 'Ponto',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(find.text('Ponto a ponto'), findsOneWidget);
    expect(find.text('SET 1'), findsOneWidget);
    expect(find.text('21-18'), findsOneWidget);
    expect(find.text('1-0'), findsOneWidget);
  });

  testWidgets('status ao vivo mostra aviso da organização', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MatchDetailLiveStatusCard(
            detail: _detail(phase: MatchDetailPhase.live),
            liveElapsedSec: 12,
          ),
        ),
      ),
    );

    expect(find.text('AO VIVO'), findsOneWidget);
    expect(find.text('00:12'), findsOneWidget);
    expect(
      find.text('Placar atualizado em tempo real pela organização.'),
      findsOneWidget,
    );
  });

  testWidgets('hero completed usa layout horizontal com placar final', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MatchDetailHeroCard(
              detail: _detail(
                phase: MatchDetailPhase.completed,
                badge: 'VITÓRIA',
                ourSets: 2,
                oppSets: 1,
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('WB1'), findsOneWidget);
    expect(find.text('VITÓRIA'), findsOneWidget);
    expect(find.text('vs'), findsOneWidget);
    expect(find.text('Placar final'), findsOneWidget);
    expect(find.text('VOCÊ'), findsNothing);
    expect(find.text('#17'), findsNothing);
  });

  testWidgets('hero live usa layout horizontal sem chips nem role labels', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MatchDetailHeroCard(
              detail: _detail(
                phase: MatchDetailPhase.live,
                badge: 'AO VIVO',
                ourSets: 1,
                oppSets: 0,
                currentSetIndex: 1,
                currentSetOurPoints: 8,
                currentSetOpponentPoints: 5,
                sets: const [
                  MatchSetScore(
                    label: 'Set 1',
                    ourScore: 21,
                    opponentScore: 18,
                  ),
                  MatchSetScore(
                    label: 'Set 2',
                    ourScore: 8,
                    opponentScore: 5,
                    isCurrentSet: true,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('vs'), findsOneWidget);
    expect(find.text('Set 2'), findsOneWidget);
    expect(find.text('8'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    // Sem role labels acima dos avatares.
    expect(find.text('VOCÊ'), findsNothing);
    expect(find.text('#17'), findsNothing);
    // Sem chips de set no estilo antigo do LiveScorePanel ("21 · 18").
    expect(find.text('21 · 18'), findsNothing);
    expect(find.text('8 · 5'), findsNothing);
  });

  testWidgets('hero scheduled usa layout horizontal com VS', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MatchDetailHeroCard(
            detail: _detail(
              phase: MatchDetailPhase.scheduled,
              badge: 'AGENDADA',
            ),
          ),
        ),
      ),
    );

    expect(find.text('AGENDADA'), findsOneWidget);
    expect(find.text('vs'), findsOneWidget);
    expect(find.text('VS'), findsOneWidget);
    expect(find.text('Sáb 10:00'), findsOneWidget);
    expect(find.text('VOCÊ'), findsNothing);
    expect(find.text('#17'), findsNothing);
  });
}
