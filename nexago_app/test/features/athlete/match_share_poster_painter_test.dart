import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_share_poster_data.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_detail/match_share_poster_painter.dart';

/// O pôster é desenhado à mão em canvas, então o que dá errado aqui é traço:
/// gradiente com stop inválido, texto sem fonte, composição que nem pinta.
/// Estes testes rasterizam de verdade e olham os pixels.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _loadFont('Sora', ['assets/fonts/Sora/Sora-Variable.ttf']);
    await _loadFont('JetBrains Mono', [
      'assets/fonts/JetBrainsMono/JetBrainsMono-Regular.ttf',
      'assets/fonts/JetBrainsMono/JetBrainsMono-ExtraBold.ttf',
    ]);
    await _loadFont('Inter', ['assets/fonts/Inter/Inter-SemiBold.ttf']);
  });

  for (final stage in MatchSharePosterStage.values) {
    test('resultado desenha em 1080×1920 (${stage.name})', () async {
      final image = await _render(_data(stage: stage, finished: true));

      expect(image.width, matchSharePosterWidth.toInt());
      expect(image.height, matchSharePosterHeight.toInt());
    });

    test('confronto desenha em 1080×1920 (${stage.name})', () async {
      final image = await _render(_data(stage: stage, finished: false));

      expect(image.width, matchSharePosterWidth.toInt());
      expect(image.height, matchSharePosterHeight.toInt());
    });
  }

  test('o fundo é o preto do pôster', () async {
    final pixels = await _pixels(_data(finished: true));
    final corner = _pixelAt(pixels, 8, 8);

    expect(corner.a, 255);
    expect(corner.r, lessThan(80), reason: 'canto superior é quase preto');
    expect(corner.g, lessThan(80));
    expect(corner.b, lessThan(80));
  });

  test('o selo da fase sai na cor da paleta', () async {
    // y=296 fica dentro da pill (284–376) e acima das letras, que ficam
    // centradas na altura — no meio o pixel seria a cor do texto.
    final game = _pixelAt(await _pixels(_data(finished: true)), 540, 296);
    expect(game.r, greaterThan(200), reason: 'laranja da marca');
    expect(game.g, inInclusiveRange(90, 170));
    expect(game.b, lessThan(110));

    final finalMatch = _pixelAt(
      await _pixels(
        _data(stage: MatchSharePosterStage.finalMatch, finished: true),
      ),
      540,
      296,
    );
    expect(finalMatch.r, greaterThan(200), reason: 'ouro da final');
    expect(finalMatch.g, greaterThan(170), reason: 'ouro da final');
  });

  test('resultado e confronto são artes diferentes', () async {
    final result = await _pixels(_data(finished: true));
    final matchup = await _pixels(_data(finished: false));

    expect(result.buffer.asUint8List(), isNot(matchup.buffer.asUint8List()));
  });

  test('placar de set único usa os pontos do set', () async {
    // 21 × 4 (set único) e 1 × 0 (sets vencidos) têm de render arte distinta.
    final singleSet = await _pixels(
      _data(finished: true, sets: const [MatchSharePosterSet(a: 21, b: 4)]),
    );
    final bestOfThree = await _pixels(
      _data(
        finished: true,
        sets: const [
          MatchSharePosterSet(a: 21, b: 18),
          MatchSharePosterSet(a: 21, b: 15),
        ],
      ),
    );

    expect(
      singleSet.buffer.asUint8List(),
      isNot(bestOfThree.buffer.asUint8List()),
    );
  });
}

MatchSharePosterData _data({
  MatchSharePosterStage stage = MatchSharePosterStage.game,
  bool finished = true,
  List<MatchSharePosterSet> sets = const [
    MatchSharePosterSet(a: 21, b: 18),
    MatchSharePosterSet(a: 19, b: 21),
    MatchSharePosterSet(a: 15, b: 11),
  ],
}) {
  return MatchSharePosterData(
    tournamentName: 'Torneio Seed nexaGO',
    phaseLabel: 'Grupo A · rodada 1',
    categoryName: 'Iniciante 1 Masculino',
    stage: stage,
    live: !finished,
    finished: finished,
    teamA: const MatchSharePosterTeam(
      name: 'Ana / Bruno',
      players: [
        MatchSharePosterPlayer(initial: 'AS'),
        MatchSharePosterPlayer(initial: 'BL'),
      ],
    ),
    teamB: const MatchSharePosterTeam(
      name: 'Carla / Davi',
      players: [
        MatchSharePosterPlayer(initial: 'CD'),
        MatchSharePosterPlayer(initial: 'DN'),
      ],
    ),
    winner: finished ? MatchSharePosterSide.teamA : null,
    sets: sets,
    setWinsA: sets.where((s) => s.a > s.b).length,
    setWinsB: sets.where((s) => s.b > s.a).length,
    liveLine: finished ? null : '1–0 · 2º set 14-11',
    formatLine: 'Melhor de 3',
    dateLine: 'Dom 02/08 · 17:30 · Quadra 1',
  );
}

Future<ui.Image> _render(MatchSharePosterData data) async {
  final recorder = ui.PictureRecorder();
  drawMatchSharePoster(
    ui.Canvas(
      recorder,
      const ui.Rect.fromLTWH(
        0,
        0,
        matchSharePosterWidth,
        matchSharePosterHeight,
      ),
    ),
    data,
    const {},
  );
  return recorder.endRecording().toImage(
    matchSharePosterWidth.toInt(),
    matchSharePosterHeight.toInt(),
  );
}

Future<ByteData> _pixels(MatchSharePosterData data) async {
  final image = await _render(data);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  return bytes!;
}

({int r, int g, int b, int a}) _pixelAt(ByteData pixels, int x, int y) {
  final offset = (y * matchSharePosterWidth.toInt() + x) * 4;
  return (
    r: pixels.getUint8(offset),
    g: pixels.getUint8(offset + 1),
    b: pixels.getUint8(offset + 2),
    a: pixels.getUint8(offset + 3),
  );
}

Future<void> _loadFont(String family, List<String> assets) async {
  final loader = FontLoader(family);
  for (final asset in assets) {
    loader.addFont(rootBundle.load(asset));
  }
  await loader.load();
}
