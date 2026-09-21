import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/widgets/team_profile_header.dart';

AthleteProfile _athlete(String id, String name, {String? avatarUrl}) {
  return AthleteProfile(
    id: id,
    name: name,
    avatarUrl: avatarUrl,
    sport: 'BEACH_TENNIS',
    level: 'INICIANTE',
    city: 'Goiânia',
  );
}

TeamPublicProfile _profile(List<TeamMemberEntry> members) {
  return TeamPublicProfile(
    team: TournamentTeam(
      id: 't1',
      player1Id: members.isNotEmpty ? members.first.uid : '',
      player2Id: members.length > 1 ? members[1].uid : '',
      memberUids: [for (final m in members) m.uid],
      teamSize: members.length,
      captainUid: members.isNotEmpty ? members.first.uid : null,
    ),
    members: members,
  );
}

Widget _wrap(TeamPublicProfile profile) {
  return MaterialApp(
    theme: AppTheme.dark,
    // O MediaQuery tem de herdar o `size` da view: fabricar um
    // `MediaQueryData` do zero deixa `size` em `Size.zero`, e a capa do
    // cabeçalho (`largura / 4:3`) colapsa levando o layout inteiro junto.
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(padding: const EdgeInsets.only(top: 59)),
        child: Scaffold(
          body: SingleChildScrollView(
            child: TeamProfileHeader(profile: profile, onBack: () {}),
          ),
        ),
      ),
    ),
  );
}

ProfilePhotoViewer _viewer(WidgetTester tester) =>
    tester.widget<ProfilePhotoViewer>(find.byType(ProfilePhotoViewer));

void main() {
  testWidgets('tocar no avatar da dupla amplia a foto daquele atleta',
      (tester) async {
    await tester.pumpWidget(_wrap(_profile([
      TeamMemberEntry(
        uid: 'u1',
        profile: _athlete('u1', 'Ana Lima', avatarUrl: 'https://x/ana.jpg'),
      ),
      TeamMemberEntry(
        uid: 'u2',
        profile: _athlete('u2', 'Bruno Reis', avatarUrl: 'https://x/bruno.jpg'),
      ),
    ])));

    await tester.tap(find.bySemanticsLabel('Ampliar foto de Bruno Reis'));
    await tester.pumpAndSettle();

    // As duas fotos entram na mesma galeria: abre na do atleta tocado e o
    // swipe segue para o parceiro.
    expect(_viewer(tester).photoUrls,
        ['https://x/ana.jpg', 'https://x/bruno.jpg']);
    expect(_viewer(tester).initialIndex, 1);
  });

  testWidgets('avatar de iniciais não abre nada nem desloca o índice',
      (tester) async {
    await tester.pumpWidget(_wrap(_profile([
      // Sem foto: só iniciais, nada a ampliar.
      TeamMemberEntry(uid: 'u1', profile: _athlete('u1', 'Ana Lima')),
      TeamMemberEntry(
        uid: 'u2',
        profile: _athlete('u2', 'Bruno Reis', avatarUrl: 'https://x/bruno.jpg'),
      ),
    ])));

    expect(find.bySemanticsLabel('Ampliar foto de Ana Lima'), findsNothing);

    // A galeria só tem as fotos que existem, então o parceiro é o índice 0 —
    // não o 1 da posição dele no elenco.
    await tester.tap(find.bySemanticsLabel('Ampliar foto de Bruno Reis'));
    await tester.pumpAndSettle();

    expect(_viewer(tester).photoUrls, ['https://x/bruno.jpg']);
    expect(_viewer(tester).initialIndex, 0);
  });

  testWidgets('alcançar o toque não empurrou o conteúdo do cabeçalho',
      (tester) async {
    // O `Stack` da capa cresceu para conter os avatares (senão a metade de
    // baixo deles não recebe toque). O nome tem de continuar onde estava:
    // 220 de capa + 62 do respiro que existia antes.
    final profile = _profile([
      TeamMemberEntry(
        uid: 'u1',
        profile: _athlete('u1', 'Ana Lima', avatarUrl: 'https://x/ana.jpg'),
      ),
      TeamMemberEntry(uid: 'u2', profile: _athlete('u2', 'Bruno Reis')),
    ]);
    final named = TeamPublicProfile(
      team: TournamentTeam(
        id: profile.team.id,
        player1Id: profile.team.player1Id,
        player2Id: profile.team.player2Id,
        memberUids: profile.team.memberUids,
        teamSize: 2,
        teamName: 'Dupla Teste',
      ),
      members: profile.members,
    );

    await tester.pumpWidget(_wrap(named));

    // O nome senta exatamente na base da pilha capa+avatar — ou seja, dar
    // alcance de toque ao avatar não empurrou o conteúdo para baixo.
    // Derivado das constantes do widget: número fixo apodrece quando a
    // geometria muda (era 282 na capa de altura fixa, antes de 89e20b97).
    const gapAbaixoDaPilha = 14.0;
    final largura = tester.getSize(find.byType(TeamProfileHeader)).width;
    final baseDaPilha =
        largura / TeamProfileHeader.coverAspectRatio -
        TeamProfileHeader.avatarOverlap +
        TeamProfileHeader.avatarSize;
    expect(
      tester.getTopLeft(find.text('Dupla Teste')).dy,
      baseDaPilha + gapAbaixoDaPilha,
    );
  });

  testWidgets('elenco de quatro mantém cada avatar na própria foto',
      (tester) async {
    await tester.pumpWidget(_wrap(_profile([
      TeamMemberEntry(
        uid: 'u1',
        profile: _athlete('u1', 'Ana Lima', avatarUrl: 'https://x/ana.jpg'),
      ),
      TeamMemberEntry(uid: 'u2', profile: _athlete('u2', 'Bruno Reis')),
      TeamMemberEntry(
        uid: 'u3',
        profile: _athlete('u3', 'Carla Dias', avatarUrl: 'https://x/carla.jpg'),
      ),
      // Perfil público ausente: avatar de interrogação, sem toque.
      const TeamMemberEntry(uid: 'u4'),
    ])));

    await tester.tap(find.bySemanticsLabel('Ampliar foto de Carla Dias'));
    await tester.pumpAndSettle();

    expect(_viewer(tester).photoUrls,
        ['https://x/ana.jpg', 'https://x/carla.jpg']);
    expect(_viewer(tester).initialIndex, 1);
  });
}
