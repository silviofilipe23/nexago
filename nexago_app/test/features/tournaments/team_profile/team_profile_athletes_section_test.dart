import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/widgets/team_profile_athletes_section.dart';

AthleteProfile _athlete(String id, String name, {String? gender}) {
  return AthleteProfile(
    id: id,
    name: name,
    sport: 'BEACH_TENNIS',
    level: 'INICIANTE',
    city: 'Goiânia',
    gender: gender,
  );
}

Widget _wrap(TeamPublicProfile profile) {
  return ProviderScope(
    overrides: [
      for (final member in profile.members)
        athletePublicRankingProvider(member.uid).overrideWith(
          (ref) async => const AthletePublicRankingSnapshot(),
        ),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: SingleChildScrollView(
          child: TeamProfileAthletesSection(profile: profile),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('quarteto mostra o elenco inteiro, não só os dois espelhados',
      (tester) async {
    const team = TournamentTeam(
      id: 't1',
      // Espelho legado: só Ana e Bruno.
      player1Id: 'u1',
      player2Id: 'u2',
      memberUids: ['u1', 'u2', 'u3', 'u4'],
      teamSize: 4,
      captainUid: 'u1',
      teamName: 'Time da Praia',
    );

    final profile = TeamPublicProfile(
      team: team,
      members: [
        TeamMemberEntry(
          uid: 'u1',
          profile: _athlete('u1', 'Ana Lima', gender: 'feminino'),
          isCaptain: true,
        ),
        TeamMemberEntry(
          uid: 'u2',
          profile: _athlete('u2', 'Bruno Reis', gender: 'feminino'),
        ),
        TeamMemberEntry(
          uid: 'u3',
          profile: _athlete('u3', 'Carla Dias', gender: 'feminino'),
        ),
        // Perfil público ausente: a linha aparece mesmo assim.
        const TeamMemberEntry(uid: 'u4'),
      ],
    );

    await tester.pumpWidget(_wrap(profile));
    await tester.pump();

    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('Bruno Reis'), findsOneWidget);
    expect(find.text('Carla Dias'), findsOneWidget);
    expect(find.text('Atleta'), findsOneWidget);
    expect(find.text('4 · FEMININO'), findsOneWidget);
    expect(find.text('CAPITÃO'), findsOneWidget);
  });

  testWidgets('dupla continua com dois atletas e sem selo de capitão',
      (tester) async {
    const team = TournamentTeam(id: 't2', player1Id: 'u1', player2Id: 'u2');

    final profile = TeamPublicProfile(
      team: team,
      members: [
        TeamMemberEntry(
          uid: 'u1',
          profile: _athlete('u1', 'Ana Lima', gender: 'feminino'),
          isCaptain: true,
        ),
        TeamMemberEntry(
          uid: 'u2',
          profile: _athlete('u2', 'Bia Souza', gender: 'feminino'),
        ),
      ],
    );

    await tester.pumpWidget(_wrap(profile));
    await tester.pump();

    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('Bia Souza'), findsOneWidget);
    expect(find.text('2 · FEMININO'), findsOneWidget);
    expect(find.text('CAPITÃO'), findsNothing);
  });
}
