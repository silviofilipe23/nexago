import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/predictions/prediction_share_text.dart';

/// Desenho do card de compartilhamento do ranking de palpites, 1080×1920 (9:16)
/// — a proporção do Instagram Stories e do status do WhatsApp.
///
/// Pintado direto num [ui.Canvas], sem widget e sem `RepaintBoundary`. Os
/// outros compartilhamentos do app capturam um widget da árvore, o que obriga a
/// manter o card montado fora da tela, esperar `endOfFrame` e precarregar
/// imagens antes de capturar — a parte que mais quebra. Aqui não há nada disso:
/// o desenho é determinístico e não depende do que está na tela.
///
/// SEM AVATARES, como no card equivalente da web
/// (`predictions-share-card.ts`): as duas superfícies produzem a mesma imagem.

const double kPredictionCardWidth = 1080;
const double kPredictionCardHeight = 1920;

const double _pad = 84;
const double _rowW = kPredictionCardWidth - _pad * 2;
const double _rowH = 200;
const double _rowGap = 28;

/// Respiro extra antes da linha de quem está fora do pódio: é um salto de
/// posição, não a próxima colocação.
const double _meGap = 72;

/// Faixa vertical onde a pilha de linhas vive, entre cabeçalho e rodapé. A
/// pilha é centrada aqui dentro para o card não ficar com todo o peso em cima.
const double _stackTop = 460;
const double _stackBottom = 1630;

const Color _ink = Color(0xFFF4F4F5);
const Color _mute = Color(0x99F4F4F5);
const Color _dim = Color(0x61F4F4F5);
const Color _orange = Color(0xFFFF6A1A);

/// Ouro, prata e bronze — mesma família de metais do pôster de partida.
const List<Color> _medals = [
  Color(0xFFF2C14E),
  Color(0xFFC8CCD4),
  Color(0xFFD08A5A),
];

TextPainter _text(
  String value,
  TextStyle style, {
  TextAlign align = TextAlign.left,
  double? maxWidth,
}) {
  final painter = TextPainter(
    text: TextSpan(text: value, style: style),
    textDirection: TextDirection.ltr,
    textAlign: align,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: maxWidth ?? double.infinity);
  return painter;
}

/// Espaçamento manual entre letras, para o mesmo ar do card da web.
TextPainter _tracked(String value, TextStyle style, {double spacing = 5}) {
  return _text(value, style.copyWith(letterSpacing: spacing));
}

/// Reduz a fonte até o texto caber em [maxWidth], parando em [min].
TextPainter _fitted(
  String value,
  TextStyle Function(double size) style, {
  required double maxWidth,
  required double start,
  required double min,
}) {
  var size = start;
  var painter = _text(value, style(size));
  while (size > min && painter.width > maxWidth) {
    size -= 2;
    painter = _text(value, style(size));
  }
  return _text(value, style(size), maxWidth: maxWidth);
}

void _drawWordmark(Canvas canvas, Offset origin, double size) {
  final style = AppTypography.soraRegular(
    fontSize: size,
    fontWeight: FontWeight.w800,
    color: _ink,
  );
  final nexa = _text('nexa', style)..paint(canvas, origin);
  _text('GO', style.copyWith(color: _orange))
      .paint(canvas, origin + Offset(nexa.width, 0));
}

void _drawBackdrop(Canvas canvas) {
  final rect = Rect.fromLTWH(0, 0, kPredictionCardWidth, kPredictionCardHeight);
  canvas.drawRect(rect, Paint()..color = const Color(0xFF050505));

  // Brilho laranja atrás do pódio: profundidade sem competir com o conteúdo.
  canvas.drawRect(
    rect,
    Paint()
      ..shader = ui.Gradient.radial(
        const Offset(kPredictionCardWidth / 2, 700),
        900,
        [_orange.withValues(alpha: 0.22), _orange.withValues(alpha: 0)],
      ),
  );
  canvas.drawRect(
    rect,
    Paint()
      ..shader = ui.Gradient.radial(
        const Offset(kPredictionCardWidth / 2, 1780),
        620,
        [_orange.withValues(alpha: 0.1), _orange.withValues(alpha: 0)],
      ),
  );
}

void _drawRankBadge(Canvas canvas, int rank, Offset center) {
  final medal = rank >= 1 && rank <= _medals.length ? _medals[rank - 1] : null;
  const radius = 54.0;

  canvas.drawCircle(
    center,
    radius,
    Paint()..color = medal ?? _orange.withValues(alpha: 0.22),
  );
  if (medal == null) {
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = _orange.withValues(alpha: 0.65),
    );
  }

  final label = medal != null ? '$rank' : '#$rank';
  final painter = _text(
    label,
    AppTypography.soraRegular(
      fontSize: medal != null ? 52 : 40,
      fontWeight: FontWeight.w800,
      color: medal != null ? const Color(0xFF1A1205) : _orange,
    ),
  );
  painter.paint(
    canvas,
    center - Offset(painter.width / 2, painter.height / 2),
  );
}

void _drawRow(Canvas canvas, PredictionShareRow row, double y) {
  final highlight = row.isMe;
  final rect = RRect.fromRectAndRadius(
    Rect.fromLTWH(_pad, y, _rowW, _rowH),
    const Radius.circular(34),
  );

  canvas.drawRRect(
    rect,
    Paint()
      ..color = highlight
          ? _orange.withValues(alpha: 0.16)
          : Colors.white.withValues(alpha: 0.045),
  );
  canvas.drawRRect(
    rect,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = highlight ? 3 : 2
      ..color = highlight
          ? _orange.withValues(alpha: 0.55)
          : Colors.white.withValues(alpha: 0.08),
  );

  final cy = y + _rowH / 2;
  _drawRankBadge(canvas, row.rank, Offset(_pad + 106, cy));

  // Pontos primeiro: a largura deles define o espaço que sobra para o nome.
  const scoreRight = kPredictionCardWidth - _pad - 56;
  final score = _text(
    '${row.score}',
    AppTypography.soraRegular(
      fontSize: 64,
      fontWeight: FontWeight.w800,
      color: highlight ? _orange : _ink,
    ),
  );
  score.paint(canvas, Offset(scoreRight - score.width, cy - 46));

  final pts = _tracked(
    'PTS',
    AppTypography.mono(fontSize: 22, fontWeight: FontWeight.w500, color: _dim),
    spacing: 3,
  );
  pts.paint(canvas, Offset(scoreRight - pts.width, cy + 22));

  const nameX = _pad + 190;
  final suffix = highlight
      ? _text(
          ' · você',
          AppTypography.mono(
            fontSize: 30,
            fontWeight: FontWeight.w500,
            color: _orange.withValues(alpha: 0.9),
          ),
        )
      : null;

  final nameMax =
      scoreRight - (score.width > 60 ? score.width : 60) - 48 - nameX - (suffix?.width ?? 0);
  final name = _text(
    row.name,
    AppTypography.soraRegular(fontSize: 52, fontWeight: FontWeight.w700, color: _ink),
    maxWidth: nameMax > 80 ? nameMax : 80,
  );
  name.paint(canvas, Offset(nameX, cy - name.height / 2));

  suffix?.paint(
    canvas,
    Offset(nameX + name.width + 8, cy - suffix.height / 2 + 4),
  );
}

void _drawHeader(Canvas canvas, PredictionShareData data) {
  _drawWordmark(canvas, const Offset(_pad, 96), 64);

  final eyebrow = data.tournamentName != null
      ? 'PALPITES · ${data.tournamentName!.toUpperCase()}'
      : 'PALPITES';
  _text(
    eyebrow,
    AppTypography.mono(fontSize: 24, fontWeight: FontWeight.w500, color: _dim)
        .copyWith(letterSpacing: 5),
    maxWidth: _rowW,
  ).paint(canvas, const Offset(_pad, 190));

  _text(
    'Ranking de palpites',
    AppTypography.soraRegular(fontSize: 88, fontWeight: FontWeight.w800, color: _ink),
    maxWidth: _rowW,
  ).paint(canvas, const Offset(_pad, 250));

  if (data.totalPlayers > 0) {
    final label = data.totalPlayers == 1
        ? '1 PARTICIPANTE'
        : '${data.totalPlayers} PARTICIPANTES';
    _tracked(
      label,
      AppTypography.mono(fontSize: 30, fontWeight: FontWeight.w500, color: _mute),
      spacing: 6,
    ).paint(canvas, const Offset(_pad, 372));
  }
}

void _drawFooter(Canvas canvas, PredictionShareData data) {
  const cx = kPredictionCardWidth / 2;

  final call = _tracked(
    'DÊ O SEU PALPITE EM',
    AppTypography.mono(fontSize: 26, fontWeight: FontWeight.w700, color: _dim),
    spacing: 8,
  );
  call.paint(canvas, Offset(cx - call.width / 2, 1686));

  // A URL encolhe até caber em vez de truncar: com id de torneio real (20 caracteres) ela é
  // sempre longa, e um endereço cortado com "…" não leva ninguém a lugar nenhum.
  final url = _fitted(
    data.urlLabel,
    (size) => AppTypography.soraRegular(
      fontSize: size,
      fontWeight: FontWeight.w700,
      color: _orange,
    ),
    maxWidth: _rowW,
    start: 44,
    min: 26,
  );
  url.paint(canvas, Offset(cx - url.width / 2, 1752));

  const size = 40.0;
  final mark = _text(
    'nexaGO',
    AppTypography.soraRegular(fontSize: size, fontWeight: FontWeight.w800, color: _ink),
  );
  _drawWordmark(canvas, Offset(cx - mark.width / 2, 1832), size);
}

/// Pinta o card inteiro no [canvas], em coordenadas de 1080×1920.
void paintPredictionShareCard(Canvas canvas, PredictionShareData data) {
  _drawBackdrop(canvas);
  _drawHeader(canvas, data);

  final rows = data.top.length;
  final stackH = (rows > 0 ? rows * _rowH + (rows - 1) * _rowGap : 0) +
      (data.me != null ? _meGap + _rowH : 0);
  var y = _stackTop + (_stackBottom - _stackTop - stackH).clamp(0, double.infinity) / 2;

  for (final row in data.top) {
    _drawRow(canvas, row, y);
    y += _rowH + _rowGap;
  }

  final me = data.me;
  if (me != null) {
    y += _meGap - _rowGap;
    _drawDashedDivider(canvas, y - _meGap / 2);
    _drawRow(canvas, me, y);
  }

  _drawFooter(canvas, data);
}

/// Alpha alto de propósito: a 1080px reduzidos para a largura de um celular,
/// um tracejado sutil demais simplesmente some.
void _drawDashedDivider(Canvas canvas, double y) {
  final paint = Paint()
    ..color = Colors.white.withValues(alpha: 0.2)
    ..strokeWidth = 4;
  const start = _pad + 40;
  const end = kPredictionCardWidth - _pad - 40;
  for (var x = start; x < end; x += 28) {
    canvas.drawLine(Offset(x, y), Offset((x + 12).clamp(start, end), y), paint);
  }
}

/// Renderiza o card e devolve os bytes PNG.
Future<ui.Image> renderPredictionShareCard(PredictionShareData data) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    const Rect.fromLTWH(0, 0, kPredictionCardWidth, kPredictionCardHeight),
  );
  paintPredictionShareCard(canvas, data);
  return recorder.endRecording().toImage(
        kPredictionCardWidth.round(),
        kPredictionCardHeight.round(),
      );
}
