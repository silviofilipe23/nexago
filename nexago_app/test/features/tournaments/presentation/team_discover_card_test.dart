import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/team_discover/team_discover_card.dart';

AthleteProfile _player({
  String id = 'p1',
  String name = 'Marina Duarte',
  String city = 'Goiânia',
  String? state = 'GO',
}) {
  return AthleteProfile(
    id: id,
    name: name,
    gender: 'feminino',
    city: city,
    state: state,
    sport: 'Vôlei de praia',
    level: 'Intermediário',
    category: 'Cat A',
    primarySportFirestoreId: 'VOLEI_PRAIA',
  );
}

TeamDiscoverEntry _entry({
  String? teamName,
  int? rank,
  bool lookingForPartner = false,
}) {
  return buildTeamDiscoverEntry(
    team: TournamentTeam(
      id: 't1',
      teamName: teamName,
      player1Id: 'p1',
      player2Id: lookingForPartner ? 'p1' : 'p2',
    ),
    player1: _player(),
    player2:
        lookingForPartner ? _player() : _player(id: 'p2', name: 'Helena Reis'),
    ranking: TeamDiscoverRankingSnapshot(rank: rank, points: 1240),
  );
}

Future<void> _pump(WidgetTester tester, TeamDiscoverEntry entry) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        // Viewer na MESMA cidade da dupla: é o caso em que a distância
        // hard-coded de antes imprimia "8 km".
        athleteProfileProvider.overrideWith(
          (ref) => Stream.value(_player(id: 'viewer', name: 'Quem Olha')),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: TeamDiscoverCard(entry: entry)),
      ),
    ),
  );
  // Deixa o stream do viewer emitir antes de olhar a tela.
  await tester.pump();
}

void main() {
  testWidgets('mostra o nome da dupla e os dois atletas', (tester) async {
    await _pump(tester, _entry(teamName: 'Areia Viva'));

    expect(find.text('Areia Viva'), findsOneWidget);
    expect(find.text('MARINA DUARTE · HELENA REIS'), findsOneWidget);
  });

  testWidgets('sem nome próprio, não repete os atletas embaixo do título',
      (tester) async {
    await _pump(tester, _entry());

    // O título já é derivado dos dois atletas — a linha de membros seria eco.
    expect(find.text('MARINA DUARTE · HELENA REIS'), findsNothing);
    expect(find.textContaining('GOIÂNIA', findRichText: true), findsOneWidget);
  });

  testWidgets('mostra o esporte na linha de força da equipe', (tester) async {
    await _pump(tester, _entry(teamName: 'Areia Viva'));

    expect(find.text('VÔLEI DE PRAIA'), findsOneWidget);
  });

  testWidgets('nunca imprime distância em km', (tester) async {
    await _pump(tester, _entry(teamName: 'Areia Viva'));

    expect(
      find.textContaining('km', findRichText: true),
      findsNothing,
    );
  });

  testWidgets('mostra #rank quando a dupla está ranqueada', (tester) async {
    await _pump(tester, _entry(teamName: 'Areia Viva', rank: 12));

    expect(find.text('#12'), findsOneWidget);
  });

  testWidgets('omite o rank quando a dupla não está ranqueada', (tester) async {
    await _pump(tester, _entry(teamName: 'Areia Viva'));

    expect(find.textContaining('#', findRichText: true), findsNothing);
  });

  testWidgets('sinaliza PROCURA DUPLA só quando a flag está ligada',
      (tester) async {
    await _pump(tester, _entry(teamName: 'Solo', lookingForPartner: true));
    expect(
      find.textContaining('PROCURA DUPLA', findRichText: true),
      findsOneWidget,
    );

    await _pump(tester, _entry(teamName: 'Areia Viva'));
    expect(
      find.textContaining('PROCURA DUPLA', findRichText: true),
      findsNothing,
    );
  });
}
