import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_share_card.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/share/team_share_card.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/share/team_share_card_atoms.dart';
import 'package:nexago_app/features/tournaments/presentation/team_profile/share/team_share_card_page.dart';

TeamShareMember _member(String name, {String detail = ''}) => TeamShareMember(
      name: name,
      initials: name.substring(0, 2).toUpperCase(),
      detail: detail,
    );

/// Pior caso de texto: nomes compridos, cinco atletas, etapas longas.
TeamShareCardData _data({required bool duo, int? rank = 128}) {
  return TeamShareCardData(
    teamId: 'team-1',
    name: duo
        ? 'Guilherme Albuquerque / Eduardo Vasconcelos'
        : 'Associação Beach Club Iracema Sub-21 Masculino',
    isDuo: duo,
    monogram: 'ABC',
    hue: 14,
    members: duo
        ? [
            _member('Guilherme Albuquerque', detail: '#128 NO RANKING 2026'),
            _member('Eduardo Vasconcelos'),
          ]
        : [
            for (final n in ['Mateus', 'Arthur', 'Tiago', 'Kauã', 'Rafael'])
              _member('$n Figueiredo'),
          ],
    rosterSize: duo ? 2 : 5,
    link: 'https://atleta.nexago.com.br/equipes/team-1',
    sportLabel: 'Vôlei de Praia',
    location: 'São José dos Campos · SP',
    sinceYear: 2025,
    rank: rank,
    points: 148200,
    games: 146,
    wins: 135,
    winRatePercent: 92,
    titles: 16,
    stages: const [
      TeamShareStage(
        name: 'Campeonato Goiano de Beach Tennis e Vôlei de Praia 2026',
        result: '1º',
      ),
      TeamShareStage(name: 'Open Iracema', result: 'QUARTAS'),
      TeamShareStage(name: 'Copa Aquiraz', result: '2º'),
    ],
    form: const [true, true, false, true, true],
  );
}

Future<void> _pumpCard(
  WidgetTester tester,
  TeamShareCardData data,
  TeamShareCardStyle style,
) async {
  // A tela padrão do teste (800×600) cortaria a altura do card.
  tester.view.physicalSize = const Size(400, 700);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Center(child: TeamShareCard(data: data, style: style)),
    ),
  );
}

void main() {
  for (final duo in [true, false]) {
    for (final style in TeamShareCardStyle.values) {
      testWidgets(
          '${duo ? 'dupla' : 'equipe'} · ${style.name}: '
          'pior caso cabe em 360×640 sem estourar', (tester) async {
        await _pumpCard(tester, _data(duo: duo), style);

        expect(tester.takeException(), isNull);
        expect(tester.getSize(find.byType(TeamShareCard)), TeamShareCard.size);
      });
    }
  }

  testWidgets('ficha: as fotos vão em moldura retrato, não em círculo miúdo',
      (tester) async {
    await _pumpCard(tester, _data(duo: true), TeamShareCardStyle.roster);

    final photos = find.byType(TeamSharePhotoTile);
    expect(photos, findsNWidgets(2));
    expect(tester.getSize(photos.first).height, 228);
    expect(find.byType(TeamShareAvatar), findsNothing);
  });

  test('foto redonda: o zoom faz o bloco caber no círculo da foto', () {
    // Moldura da ficha: o cover põe a foto quadrada com lado 228; o círculo
    // dela precisa de diâmetro igual à diagonal da moldura.
    const box = Size(148, 228);
    final scale = teamShareCircleCropScale(box);
    final radius = box.longestSide * scale / 2;

    expect(scale, closeTo(1.192, 0.001));
    expect(
      radius,
      greaterThanOrEqualTo(box.center(Offset.zero).distance - 1e-9),
    );
    expect(
        teamShareCircleCropScale(const Size(100, 100)), closeTo(1.4142, 1e-4));
    expect(teamShareCircleCropScale(Size.zero), 1);
  });

  testWidgets('ranking: os rostos ficam grandes no vão, fora do painel',
      (tester) async {
    for (final duo in [true, false]) {
      // Pior caso de espaço: nome em duas linhas e três etapas no painel.
      await _pumpCard(tester, _data(duo: duo), TeamShareCardStyle.ranking);

      final faces = find.byType(TeamShareAvatar);
      expect(faces, findsNWidgets(duo ? 2 : 5));
      expect(tester.getSize(faces.first).width, greaterThan(55));
      expect(
        find.descendant(
          of: find.byType(TeamShareDarkPanel),
          matching: find.byType(TeamShareAvatar),
        ),
        findsNothing,
      );
    }
  });

  testWidgets('dupla sem jogos nem etapas não quebra o card de ranking',
      (tester) async {
    final empty = TeamShareCardData(
      teamId: 'team-1',
      name: 'Ana / Bia',
      isDuo: true,
      monogram: 'AB',
      hue: 200,
      members: [_member('Ana'), _member('Bia')],
      rosterSize: 2,
      link: 'https://atleta.nexago.com.br/equipes/team-1',
      rank: 1,
    );

    for (final style in TeamShareCardStyle.values) {
      await _pumpCard(tester, empty, style);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('tela troca o estilo e esconde Ranking sem posição',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: TeamShareCardPage(data: _data(duo: false, rank: null)),
      ),
    );
    await tester.pump();

    expect(find.text('Compartilhar equipe'), findsOneWidget);
    expect(find.byKey(const Key('team-share-style-ranking')), findsNothing);
    expect(find.text('ELENCO · 5 ATLETAS'), findsOneWidget);

    await tester.tap(find.byKey(const Key('team-share-style-roster')));
    await tester.pump();

    expect(find.text('ELENCO · 5 ATLETAS'), findsNothing);
    expect(find.text('5 ATLETAS'), findsOneWidget);
  });
}
