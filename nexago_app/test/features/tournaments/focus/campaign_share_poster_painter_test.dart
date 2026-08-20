import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/campaign_share_data.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/campaign_share_poster_painter.dart';

CampaignShareData _data({
  CampaignPlacement placement = CampaignPlacement.champion,
  List<CampaignRow> rows = const [],
  String teamName = 'Eu e Fulano',
  String? dateRangeLabel = '25–26 ABR 2026',
}) {
  return CampaignShareData(
    placement: placement,
    categoryLine: 'Masculino B · Duplas',
    teamName: teamName,
    players: const [
      CampaignPlayer(initial: 'E'),
      CampaignPlayer(initial: 'F'),
    ],
    wins: 4,
    losses: 1,
    setsWon: 8,
    setsLost: 3,
    winRateLabel: 'Aprov. 80%',
    rows: rows,
    tournamentName: 'Copa Teste de Verão',
    locationName: 'Arena X',
    dateRangeLabel: dateRangeLabel,
  );
}

/// Pinta de verdade num `PictureRecorder`: é o único jeito de pegar exceção de
/// canvas (shader inválido, retângulo negativo, texto sem layout) — nenhum
/// teste de widget alcança o desenho do pôster, que só roda na exportação.
void _paint(CampaignShareData data) {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    const Rect.fromLTWH(0, 0, campaignCardWidth, campaignCardHeight),
  );
  drawCampaignSharePoster(canvas, data, CampaignPosterAssets.empty);
  recorder.endRecording().dispose();
}

void main() {
  test('desenha as quatro skins sem estourar', () {
    for (final placement in CampaignPlacement.values) {
      _paint(_data(placement: placement));
    }
  });

  test('desenha sem linha nenhuma na trajetória', () {
    _paint(_data(rows: const []));
  });

  test('desenha com o painel cheio', () {
    _paint(_data(
      rows: [
        const CampaignGroupRow(wins: 3, losses: 1, games: 4),
        for (var i = 0; i < 5; i++)
          CampaignMatchRow(
            won: i.isEven,
            isGroup: false,
            phaseLabel: 'Quartas',
            opponentName: 'Adversário $i',
            setScore: '2–1',
            partials: const ['21-15', '18-21', '15-12'],
          ),
      ],
    ));
  });

  test('nome gigante e sem data não quebram o encaixe', () {
    // `fitFont` sozinho para no piso e devolve o texto inteiro; se o
    // `truncate` sumir do caminho, é aqui que o vazamento aparece.
    _paint(_data(
      teamName: 'Um nome de dupla absurdamente comprido que não caberia '
          'de jeito nenhum na largura do card',
      dateRangeLabel: null,
    ));
  });
}
