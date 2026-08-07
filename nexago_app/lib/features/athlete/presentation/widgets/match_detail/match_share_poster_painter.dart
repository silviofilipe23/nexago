/// Desenho do pôster de compartilhamento — porte do `drawShareCard` do portal
/// do atleta (`match-share-card.ts`). Cada traço aqui tem um par lá: as duas
/// telas precisam gerar a mesma imagem para a mesma partida.
///
/// Formato 1080×1920 (9:16): é a proporção do Instagram Stories e do status do
/// WhatsApp, os dois destinos reais do botão. Não existe link nem QR no card:
/// o compartilhamento é só a imagem.
///
/// Duas composições:
/// - partida encerrada → arte de resultado (fotos gigantes do vencedor,
///   placar, parciais);
/// - agendada/ao vivo → arte de confronto (as duas duplas, VS no meio).
/// Final e 3º lugar ganham paleta própria (ouro/bronze); o resto usa o laranja
/// da marca.
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../domain/match_history/match_share_poster_data.dart';

const double matchSharePosterWidth = 1080;
const double matchSharePosterHeight = 1920;

const double _w = matchSharePosterWidth;
const double _h = matchSharePosterHeight;
const double _cx = _w / 2;

const Color _ink = Color(0xFFF4F4F5);
const Color _mute = Color(0x99F4F4F5); // 0.6
const Color _dim = Color(0x61F4F4F5); // 0.38
const Color _orange = Color(0xFFFF6A1A);
const Color _liveRed = Color(0xFFFF3B30);

/// Pinta o pôster num [CustomPaint]. [photos] são as fotos já resolvidas por
/// URL — o desenho é síncrono, então elas precisam chegar prontas
/// (ver `loadMatchSharePosterPhotos`).
class MatchSharePosterPainter extends CustomPainter {
  const MatchSharePosterPainter({required this.data, required this.photos});

  final MatchSharePosterData data;
  final Map<String, ui.Image> photos;

  @override
  void paint(Canvas canvas, Size size) {
    drawMatchSharePoster(canvas, data, photos);
  }

  @override
  bool shouldRepaint(covariant MatchSharePosterPainter oldDelegate) =>
      !identical(oldDelegate.data, data) || !identical(oldDelegate.photos, photos);
}

/// Desenha o pôster completo em (0,0)–(1080,1920).
void drawMatchSharePoster(
  Canvas canvas,
  MatchSharePosterData data,
  Map<String, ui.Image> photos,
) {
  final m = _metal[data.stage]!;

  _drawBackdrop(
    canvas,
    m,
    data.finished ? m.markDone : m.markPending,
    data.finished,
  );
  _drawHeader(canvas, data.tournamentName);

  // selo da fase
  final badge = m.badge ?? '🏐 ${data.phaseLabel.toUpperCase()}';
  final badgeStyle = _sora(700, 40);
  _drawPill(
    canvas,
    text: _truncate(badge, badgeStyle, 820),
    style: badgeStyle,
    cx: _cx,
    cy: 330,
    padX: 50,
    height: 92,
    background: _metalShader(m, _cx - 160, 284, _cx + 160, 376),
    foreground: m.onBadge,
    glow: m.main.withValues(alpha: 0.5),
    glowBlur: 46,
  );

  final category = data.categoryName;
  if (category != null) {
    final style = _mono(700, 30, color: _mute);
    _tracked(
      canvas,
      _truncate(category.toUpperCase(), style, _w - 260),
      style,
      _cx,
      438,
      9,
    );
  }

  if (data.finished && data.winner != null) {
    _drawResult(canvas, data, photos, m);
  } else {
    _drawMatchup(canvas, data, photos, m);
  }

  _drawFooter(canvas, data.dateLine);
}

// --- Paletas ----------------------------------------------------------------

class _Metal {
  const _Metal({
    required this.main,
    required this.hi,
    required this.onBadge,
    required this.badge,
    required this.crown,
    required this.winLabel,
    required this.loseLabel,
    required this.markDone,
    required this.markPending,
  });

  final Color main;
  final Color hi;
  final Color onBadge;

  /// `null` = calculado a partir da fase da partida.
  final String? badge;
  final String crown;
  final String winLabel;
  final String loseLabel;
  final String markDone;
  final String markPending;
}

const Map<MatchSharePosterStage, _Metal> _metal = {
  MatchSharePosterStage.finalMatch: _Metal(
    main: Color(0xFFF2C14E),
    hi: Color(0xFFFFE9A8),
    onBadge: Color(0xFF241A00),
    badge: '🏆 FINAL',
    crown: '👑',
    winLabel: 'CAMPEÕES',
    loseLabel: 'VICE-CAMPEÕES',
    markDone: 'CAMPEÕES',
    markPending: 'FINAL',
  ),
  MatchSharePosterStage.thirdPlace: _Metal(
    main: Color(0xFFD08A5A),
    hi: Color(0xFFF3C9A8),
    onBadge: Color(0xFF2A1608),
    badge: '🥉 3º LUGAR',
    crown: '🥉',
    winLabel: '3º LUGAR',
    loseLabel: '4º LUGAR',
    markDone: 'BRONZE',
    markPending: 'BRONZE',
  ),
  MatchSharePosterStage.game: _Metal(
    main: Color(0xFFFF6A1A),
    hi: Color(0xFFFF8A4A),
    onBadge: Color(0xFF0A0A0A),
    badge: null,
    crown: '🏐',
    winLabel: 'VITÓRIA',
    loseLabel: 'ADVERSÁRIOS',
    markDone: 'VITÓRIA',
    markPending: 'NEXAGO',
  ),
};

/// Mesmos gradientes dos avatares dos cards (`.duo-avatar`).
const List<List<Color>> _avatarGradient = [
  [Color(0xFFFF6A1A), Color(0xFFC2185B)],
  [Color(0xFF2BD17E), Color(0xFF1E7A4D)],
];

// --- Tipografia -------------------------------------------------------------

TextStyle _mono(int weight, double size, {Color? color, Paint? foreground}) =>
    _style('JetBrains Mono', weight, size, color, foreground);

TextStyle _sora(int weight, double size, {Color? color, Paint? foreground}) =>
    _style('Sora', weight, size, color, foreground);

TextStyle _inter(int weight, double size, {Color? color, Paint? foreground}) =>
    _style('Inter', weight, size, color, foreground);

TextStyle _style(
  String family,
  int weight,
  double size,
  Color? color,
  Paint? foreground,
) {
  return TextStyle(
    fontFamily: family,
    fontWeight: FontWeight.values[(weight ~/ 100) - 1],
    fontSize: size,
    height: 1,
    color: foreground == null ? (color ?? _ink) : null,
    foreground: foreground,
  );
}

/// Emoji sem família definida: quem desenha é a fonte de emoji do sistema.
TextStyle _emoji(double size) => TextStyle(fontSize: size, height: 1);

TextPainter _layout(String text, TextStyle style) {
  return TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: TextDirection.ltr,
  )..layout();
}

double _measure(String text, TextStyle style) => _layout(text, style).width;

enum _Align { left, center }

/// `fillText` com baseline alfabética, como no canvas.
void _fillText(
  Canvas canvas,
  String text,
  TextStyle style,
  double x,
  double baselineY, {
  _Align align = _Align.left,
}) {
  final painter = _layout(text, style);
  final dx = align == _Align.center ? x - painter.width / 2 : x;
  final baseline = painter.computeDistanceToActualBaseline(
    TextBaseline.alphabetic,
  );
  painter.paint(canvas, Offset(dx, baselineY - baseline));
}

/// `fillText` com `textBaseline = 'middle'`.
void _fillTextMiddle(
  Canvas canvas,
  String text,
  TextStyle style,
  double cx,
  double cy,
) {
  final painter = _layout(text, style);
  painter.paint(canvas, Offset(cx - painter.width / 2, cy - painter.height / 2));
}

/// Texto com espaçamento manual entre letras (o canvas não tem letter-spacing
/// confiável; aqui o porte mantém a mesma métrica para as duas telas baterem).
void _tracked(
  Canvas canvas,
  String text,
  TextStyle style,
  double x,
  double baselineY,
  double spacing, {
  _Align align = _Align.center,
}) {
  final chars = text.characters.toList();
  if (chars.isEmpty) return;
  final widths = [for (final c in chars) _measure(c, style)];
  final total =
      widths.fold<double>(0, (a, b) => a + b) + spacing * (chars.length - 1);
  var cursor = align == _Align.center ? x - total / 2 : x;
  for (var i = 0; i < chars.length; i++) {
    _fillText(canvas, chars[i], style, cursor, baselineY);
    cursor += widths[i] + spacing;
  }
}

/// Reduz a fonte até o texto caber e devolve o estilo ajustado.
TextStyle _fitFont(
  String text,
  double maxWidth,
  double start,
  double min,
  TextStyle Function(double size) font,
) {
  var size = start;
  var style = font(size);
  while (size > min && _measure(text, style) > maxWidth) {
    size -= 4;
    style = font(size);
  }
  return style;
}

String _truncate(String text, TextStyle style, double maxWidth) {
  if (_measure(text, style) <= maxWidth) return text;
  var result = text;
  while (result.length > 1 && _measure('$result…', style) > maxWidth) {
    result = result.substring(0, result.length - 1);
  }
  return '$result…';
}

// --- Pintura base -----------------------------------------------------------

ui.Gradient _metalShader(
  _Metal m,
  double x0,
  double y0,
  double x1,
  double y1,
) {
  return ui.Gradient.linear(Offset(x0, y0), Offset(x1, y1), [m.hi, m.main]);
}

Paint _shaderPaint(ui.Gradient gradient) => Paint()..shader = gradient;

/// Foto circular com aro; sem foto, iniciais sobre o gradiente do avatar.
void _drawAvatar(
  Canvas canvas,
  ui.Image? image,
  String initial,
  int index,
  double x,
  double y,
  double r,
  Object ring, // Color ou ui.Gradient
  double ringWidth,
) {
  // respiro escuro entre o aro e a foto
  canvas.drawCircle(
    Offset(x, y),
    r + ringWidth + 6,
    Paint()..color = const Color(0xFF050505),
  );

  final ringPaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = ringWidth;
  if (ring is ui.Gradient) {
    ringPaint.shader = ring;
  } else {
    ringPaint.color = ring as Color;
  }
  canvas.drawCircle(Offset(x, y), r + ringWidth / 2 + 4, ringPaint);

  canvas.save();
  canvas.clipPath(Path()..addOval(Rect.fromCircle(center: Offset(x, y), radius: r)));
  if (image != null) {
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      Rect.fromCircle(center: Offset(x, y), radius: r),
      Paint()..filterQuality = FilterQuality.high,
    );
  } else {
    final colors = _avatarGradient[index % 2];
    canvas.drawRect(
      Rect.fromCircle(center: Offset(x, y), radius: r),
      _shaderPaint(
        ui.Gradient.linear(
          Offset(x - r, y - r),
          Offset(x + r, y + r),
          colors,
        ),
      ),
    );
    _fillTextMiddle(
      canvas,
      initial,
      _sora(700, r * 0.6, color: Colors.white),
      x,
      y + r * 0.04,
    );
  }
  canvas.restore();
}

/// Dupla: duas fotos sobrepostas centradas em (cx, cy).
void _drawPair(
  Canvas canvas,
  MatchSharePosterTeam team,
  Map<String, ui.Image> photos,
  double cx,
  double cy,
  double r,
  Object ring,
  double ringWidth,
) {
  final off = r * 0.88;
  for (var i = 0; i < team.players.length; i++) {
    final player = team.players[i];
    final url = player.photoUrl;
    _drawAvatar(
      canvas,
      url == null ? null : photos[url],
      player.initial,
      i,
      cx + (i == 0 ? -off : off),
      cy,
      r,
      ring,
      ringWidth,
    );
  }
}

/// Pill arredondada com texto centrado.
void _drawPill(
  Canvas canvas, {
  required String text,
  required TextStyle style,
  required double cx,
  required double cy,
  required double padX,
  required double height,
  required Object background, // Color ou ui.Gradient
  required Color foreground,
  Color? stroke,
  Color? glow,
  double glowBlur = 0,
}) {
  final width = _measure(text, style) + padX * 2;
  final rect = RRect.fromRectAndRadius(
    Rect.fromCenter(center: Offset(cx, cy), width: width, height: height),
    Radius.circular(height / 2),
  );

  if (glow != null && glowBlur > 0) {
    canvas.drawRRect(
      rect,
      Paint()
        ..color = glow
        // O `shadowBlur` do canvas é ~2σ.
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, glowBlur / 2),
    );
  }

  final fill = Paint();
  if (background is ui.Gradient) {
    fill.shader = background;
  } else {
    fill.color = background as Color;
  }
  canvas.drawRRect(rect, fill);

  if (stroke != null) {
    canvas.drawRRect(
      rect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = stroke,
    );
  }

  _fillTextMiddle(canvas, text, style.copyWith(color: foreground), cx, cy + 2);
}

void _drawBackdrop(Canvas canvas, _Metal m, String mark, bool finished) {
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, _w, _h),
    Paint()..color = const Color(0xFF050505),
  );

  // banho metálico descendo do topo
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, _w, _h * 0.45),
    _shaderPaint(
      ui.Gradient.linear(Offset.zero, const Offset(0, _h * 0.45), [
        m.main.withValues(alpha: 0.13),
        const Color(0x00000000),
      ]),
    ),
  );

  // brilho radial atrás das fotos
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, _w, _h),
    _shaderPaint(
      ui.Gradient.radial(
        const Offset(_cx, 800),
        660,
        [
          m.main.withValues(alpha: finished ? 0.22 : 0.14),
          m.main.withValues(alpha: finished ? 0.22 : 0.14),
          const Color(0x00000000),
        ],
        // O gradiente do canvas começa cheio no raio interno de 80.
        const [0.0, 80 / 660, 1.0],
      ),
    ),
  );

  // calor laranja da marca no rodapé
  canvas.drawRect(
    const Rect.fromLTWH(0, _h - 700, _w, 700),
    _shaderPaint(
      ui.Gradient.radial(
        const Offset(_cx, _h + 160),
        700,
        [
          _orange.withValues(alpha: 0.14),
          _orange.withValues(alpha: 0.14),
          const Color(0x00000000),
        ],
        const [0.0, 60 / 700, 1.0],
      ),
    ),
  );

  // linhas diagonais: marcação de quadra sobre a areia
  canvas.save();
  canvas.translate(_cx, _h / 2);
  canvas.rotate(-0.42);
  final linePaint = Paint()
    ..color = Colors.white.withValues(alpha: 0.028)
    ..strokeWidth = 2;
  for (var i = -13; i <= 13; i++) {
    canvas.drawLine(
      Offset(i * 115, -1400),
      Offset(i * 115, 1400),
      linePaint,
    );
  }
  canvas.restore();

  // marca d'água vertical vazada na borda direita — assinatura do pôster
  canvas.save();
  canvas.translate(_w - 74, _h / 2);
  canvas.rotate(-math.pi / 2);
  _fillTextMiddle(
    canvas,
    mark,
    _sora(
      800,
      210,
      foreground: Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = m.main.withValues(alpha: 0.1),
    ),
    0,
    0,
  );
  canvas.restore();

  if (finished) {
    const sparks = <List<double>>[
      [150, 470, 44, 0.8],
      [910, 400, 30, 0.55],
      [120, 1130, 26, 0.45],
      [950, 1210, 40, 0.75],
      [225, 1555, 24, 0.4],
      [845, 285, 22, 0.5],
    ];
    for (final spark in sparks) {
      _fillTextMiddle(
        canvas,
        '✦',
        TextStyle(
          fontSize: spark[2],
          height: 1,
          color: m.main.withValues(alpha: spark[3]),
        ),
        spark[0],
        spark[1],
      );
    }
  }
}

/// "nexaGO" com o GO laranja; devolve o X onde o texto terminou.
double _drawWordmark(Canvas canvas, double x, double baseline, double size) {
  final nexa = _sora(800, size, color: _ink);
  final go = _sora(800, size, color: _orange);
  _fillText(canvas, 'nexa', nexa, x, baseline);
  final nexaW = _measure('nexa', nexa);
  _fillText(canvas, 'GO', go, x + nexaW, baseline);
  return x + nexaW + _measure('GO', go);
}

void _drawHeader(Canvas canvas, String? tournamentName) {
  _drawWordmark(canvas, 72, 138, 64);
  if (tournamentName != null) {
    final style = _mono(500, 22, color: _dim);
    _tracked(
      canvas,
      _truncate(tournamentName.toUpperCase(), style, _w - 300),
      style,
      72,
      186,
      5,
      align: _Align.left,
    );
  }
}

void _drawFooter(Canvas canvas, String? dateLine) {
  final style = _mono(500, 26, color: _dim);
  _tracked(
    canvas,
    (dateLine ?? 'Acompanhe no nexaGO').toUpperCase(),
    style,
    _cx,
    1766,
    6,
  );

  // lockup pequeno centrado no pé
  const size = 40.0;
  final wordW = _measure('nexaGO', _sora(800, size));
  _drawWordmark(canvas, _cx - wordW / 2, 1848, size);
}

// --- Composições ------------------------------------------------------------

void _drawResult(
  Canvas canvas,
  MatchSharePosterData data,
  Map<String, ui.Image> photos,
  _Metal m,
) {
  final featuredIsA = data.winner != MatchSharePosterSide.teamB;
  final featured = featuredIsA ? data.teamA : data.teamB;
  final other = featuredIsA ? data.teamB : data.teamA;

  final singleSet = data.sets.length == 1;
  // set único: os próprios pontos são o placar da arte (21 × 18);
  // melhor de 3: sets vencidos
  final int bigWin;
  final int bigLose;
  if (singleSet) {
    bigWin = featuredIsA ? data.sets[0].a : data.sets[0].b;
    bigLose = featuredIsA ? data.sets[0].b : data.sets[0].a;
  } else {
    bigWin = featuredIsA ? data.setWinsA : data.setWinsB;
    bigLose = featuredIsA ? data.setWinsB : data.setWinsA;
  }

  // coroa/medalha + fotos gigantes da dupla vencedora
  _fillText(canvas, m.crown, _emoji(80), _cx, 588, align: _Align.center);
  _drawPair(
    canvas,
    featured,
    photos,
    _cx,
    800,
    185,
    _metalShader(m, _cx - 340, 615, _cx + 340, 985),
    8,
  );

  // nome da dupla em destaque
  final nameStyle = _fitFont(
    featured.name,
    930,
    96,
    56,
    (size) => _sora(800, size, color: _ink),
  );
  _fillText(canvas, featured.name, nameStyle, _cx, 1108, align: _Align.center);

  // rótulo em degradê metálico
  _tracked(
    canvas,
    m.winLabel,
    _sora(
      800,
      46,
      foreground: _shaderPaint(_metalShader(m, _cx - 240, 1150, _cx + 240, 1195)),
    ),
    _cx,
    1188,
    16,
  );

  // placar gigante
  const scoreY = 1408.0;
  final winTxt = '$bigWin';
  final loseTxt = '$bigLose';
  final bigStyle = _mono(800, 215);
  final crossStyle = _mono(400, 88, color: _dim);
  final winW = _measure(winTxt, bigStyle);
  final loseW = _measure(loseTxt, bigStyle);
  final crossW = _measure('×', crossStyle);
  const gap = 56.0;
  var x = _cx - (winW + gap + crossW + gap + loseW) / 2;
  _fillText(
    canvas,
    winTxt,
    _mono(
      800,
      215,
      foreground: _shaderPaint(
        ui.Gradient.linear(Offset(x, scoreY - 190), Offset(x + winW, scoreY), [
          m.hi,
          m.main,
        ]),
      ),
    ),
    x,
    scoreY,
  );
  x += winW + gap;
  _fillText(canvas, '×', crossStyle, x, scoreY - 52);
  x += crossW + gap;
  _fillText(
    canvas,
    loseTxt,
    _mono(800, 215, color: _ink.withValues(alpha: 0.26)),
    x,
    scoreY,
  );

  // parciais (melhor de 3): pills na perspectiva da dupla em destaque
  if (!singleSet && data.sets.isNotEmpty) {
    final style = _mono(700, 36, color: _ink);
    final texts = [
      for (final s in data.sets)
        featuredIsA ? '${s.a}·${s.b}' : '${s.b}·${s.a}',
    ];
    final widths = [for (final t in texts) _measure(t, style) + 64];
    final totalW =
        widths.fold<double>(0, (a, b) => a + b) + (texts.length - 1) * 20;
    var px = _cx - totalW / 2;
    for (var i = 0; i < texts.length; i++) {
      _drawPill(
        canvas,
        text: texts[i],
        style: style,
        cx: px + widths[i] / 2,
        cy: 1508,
        padX: 32,
        height: 72,
        background: const Color(0xEB1B1B1F),
        foreground: _ink,
        stroke: Colors.white.withValues(alpha: 0.1),
      );
      px += widths[i] + 20;
    }
  }

  // a outra dupla (vice, 4º lugar ou adversários)
  final rowY = singleSet ? 1560.0 : 1638.0;
  _tracked(canvas, m.loseLabel, _mono(500, 24, color: _dim), _cx, rowY, 8);
  final otherStyle = _fitFont(
    other.name,
    560,
    40,
    28,
    (size) => _inter(600, size, color: _mute),
  );
  const r = 42.0;
  const pairW = r * 2 + r * 1.3;
  final rowW = pairW + 26 + _measure(other.name, otherStyle);
  final startX = _cx - rowW / 2;
  _drawPair(
    canvas,
    other,
    photos,
    startX + pairW / 2,
    rowY + 62,
    r,
    Colors.white.withValues(alpha: 0.25),
    3,
  );
  _fillText(
    canvas,
    other.name,
    otherStyle,
    startX + pairW + 26,
    rowY + 62 + (otherStyle.fontSize ?? 40) * 0.34,
  );
}

void _drawMatchup(
  Canvas canvas,
  MatchSharePosterData data,
  Map<String, ui.Image> photos,
  _Metal m,
) {
  if (data.live) {
    _drawPill(
      canvas,
      text: '● AO VIVO',
      style: _mono(700, 26),
      cx: _cx,
      cy: 516,
      padX: 34,
      height: 64,
      background: _liveRed,
      foreground: Colors.white,
      glow: _liveRed.withValues(alpha: 0.55),
      glowBlur: 30,
    );
  }

  void drawTeam(MatchSharePosterTeam team, double photoCy, double nameY) {
    _drawPair(
      canvas,
      team,
      photos,
      _cx,
      photoCy,
      150,
      _metalShader(m, _cx - 280, photoCy - 150, _cx + 280, photoCy + 150),
      7,
    );
    final style = _fitFont(
      team.name,
      930,
      84,
      52,
      (size) => _sora(800, size, color: _ink),
    );
    _fillText(canvas, team.name, style, _cx, nameY, align: _Align.center);
  }

  drawTeam(data.teamA, 712, 952);
  drawTeam(data.teamB, 1300, 1540);

  // divisor VS
  const vsY = 1082.0;
  final dividerPaint = Paint()
    ..color = m.main.withValues(alpha: 0.35)
    ..strokeWidth = 2;
  for (final segment in const [
    [150.0, _cx - 110],
    [_cx + 110, 930.0],
  ]) {
    canvas.drawLine(
      Offset(segment[0], vsY),
      Offset(segment[1], vsY),
      dividerPaint,
    );
  }
  _fillTextMiddle(
    canvas,
    'VS',
    _mono(
      800,
      74,
      foreground: _shaderPaint(
        ui.Gradient.linear(
          const Offset(_cx - 60, vsY - 60),
          const Offset(_cx + 60, vsY + 30),
          [m.hi, m.main],
        ),
      ),
    ),
    _cx,
    vsY,
  );

  // ao vivo, o placar do momento vale mais que o formato do jogo
  final liveLine = data.live ? data.liveLine : null;
  _tracked(
    canvas,
    (liveLine ?? data.formatLine).toUpperCase(),
    _mono(500, 26, color: liveLine != null ? _mute : _dim),
    _cx,
    1652,
    6,
  );
}
