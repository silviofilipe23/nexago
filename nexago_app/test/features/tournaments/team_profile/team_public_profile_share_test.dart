import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_follow_providers.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/share/team_share_card_page.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/team_public_profile_page.dart';

TeamPublicProfile _profile({String player2Id = 'u2'}) {
  final ids = {'u1', player2Id}.toList();
  return TeamPublicProfile(
    team: TournamentTeam(
      id: 'team-1',
      player1Id: 'u1',
      player2Id: player2Id,
      memberUids: ids,
    ),
    members: [
      for (final uid in ids)
        TeamMemberEntry(
          uid: uid,
          profile: AthleteProfile(
            id: uid,
            name: uid == 'u1' ? 'Ana Souza' : 'Bia Lima',
            sport: 'Vôlei de praia',
            level: 'INICIANTE',
            city: 'Fortaleza',
          ),
        ),
    ],
    ranking: const TeamDiscoverRankingSnapshot(rank: 3, points: 4280),
    // O próprio time: sem a linha "Seguir", que pede sessão.
    isCurrentUserTeam: true,
  );
}

Widget _app(TeamPublicProfile profile) {
  return ProviderScope(
    overrides: [
      teamPublicProfileProvider('team-1').overrideWith((ref) async => profile),
      teamMatchHistoryProvider('team-1').overrideWith(
        (ref) async => const TeamMatchHistoryBundle(),
      ),
      teamIsFollowedProvider('team-1').overrideWith(
        (ref) => Stream.value(false),
      ),
      for (final member in profile.members)
        athletePublicRankingProvider(member.uid).overrideWith(
          (ref) async => AthletePublicRankingSnapshot(
            rank: member.uid == 'u1' ? 12 : null,
            seasonYear: 2026,
          ),
        ),
    ],
    child: MaterialApp(
      theme: AppTheme.dark,
      home: const TeamPublicProfilePage(teamId: 'team-1'),
    ),
  );
}

void main() {
  testWidgets('compartilhar abre o card da dupla com os dados do perfil',
      (tester) async {
    // Largo: com a fonte de teste a barra de abas do perfil não cabe em 402.
    tester.view.physicalSize = const Size(1200, 1748);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app(_profile()));
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('team-profile-share')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(TeamShareCardPage), findsOneWidget);
    expect(find.text('Compartilhar dupla'), findsOneWidget);
    expect(find.byKey(const Key('team-share-style-ranking')), findsOneWidget);

    // Ficha: o ranking individual que a seção de atletas já carregou.
    await tester.tap(find.byKey(const Key('team-share-style-roster')));
    await tester.pump();
    expect(find.text('#12 NO RANKING 2026'), findsOneWidget);
  });

  testWidgets('dupla à procura de parceiro não tem botão de compartilhar',
      (tester) async {
    await tester.pumpWidget(_app(_profile(player2Id: 'u1')));
    await tester.pump();
    await tester.pump();

    expect(find.byType(TeamPublicProfilePage), findsOneWidget);
    expect(find.byKey(const Key('team-profile-share')), findsNothing);
  });
}
