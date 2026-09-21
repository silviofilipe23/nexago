import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/widgets/team_profile_header.dart';

AthleteProfile _athlete(String id, {String? sportCode}) {
  return AthleteProfile(
    id: id,
    name: 'Atleta $id',
    sport: 'Beach tennis',
    level: 'INICIANTE',
    city: 'Goiânia',
    primarySportFirestoreId: sportCode,
  );
}

TeamPublicProfile _profile({required String? sportCode, int? teamSize}) {
  final members = [
    for (final uid in ['u1', 'u2'])
      TeamMemberEntry(uid: uid, profile: _athlete(uid, sportCode: sportCode)),
  ];
  return TeamPublicProfile(
    team: TournamentTeam(
      id: 't1',
      player1Id: 'u1',
      player2Id: 'u2',
      memberUids: ['u1', 'u2'],
      teamSize: teamSize,
    ),
    members: members,
  );
}

Finder _coverArt(String asset) {
  return find.byWidgetPredicate(
    (widget) =>
        widget is Image &&
        widget.image is AssetImage &&
        (widget.image as AssetImage).assetName == asset,
    description: 'Image.asset("$asset")',
  );
}

Widget _wrap(TeamPublicProfile profile) {
  return MaterialApp(
    theme: AppTheme.dark,
    home: MediaQuery(
      data: const MediaQueryData(padding: EdgeInsets.only(top: 59)),
      child: Scaffold(
        body: SingleChildScrollView(
          child: TeamProfileHeader(profile: profile, onBack: () {}),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('capa da dupla usa a arte do esporte com o elenco certo',
      (tester) async {
    await tester.pumpWidget(_wrap(_profile(sportCode: 'BEACH_TENNIS')));

    expect(
      _coverArt('assets/images/team_covers/beach_tennis_dupla.webp'),
      findsOneWidget,
    );
  });

  testWidgets('quarteto não recebe a arte de dupla do mesmo esporte',
      (tester) async {
    await tester.pumpWidget(
      _wrap(_profile(sportCode: 'VOLEI_PRAIA', teamSize: 4)),
    );

    expect(
      _coverArt('assets/images/team_covers/volei_praia_quarteto.webp'),
      findsOneWidget,
    );
    expect(
      _coverArt('assets/images/team_covers/volei_praia_dupla.webp'),
      findsNothing,
    );
  });

  testWidgets('esporte sem arte mantém o fundo pintado, sem asset nenhum',
      (tester) async {
    await tester.pumpWidget(_wrap(_profile(sportCode: null)));

    expect(
      find.byWidgetPredicate(
        (widget) => widget is Image && widget.image is AssetImage,
        description: 'qualquer Image.asset na capa',
      ),
      findsNothing,
    );
  });
}
