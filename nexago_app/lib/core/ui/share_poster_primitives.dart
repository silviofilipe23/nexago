import 'package:flutter/material.dart';

/// Primitivas de texto dos pôsteres compartilháveis (partida e campanha).
///
/// Existem num lugar só de propósito. O pôster de partida é arte desenhada à
/// mão que precisa bater com a do portal, e o de campanha é a segunda do mesmo
/// tipo — com `truncate`, `fitFont` e o espaçamento manual duplicados, uma
/// correção num lado passaria despercebida no outro. O caso concreto: `fitFont`
/// sozinho NÃO garante encaixe (ele encolhe até o piso e devolve o texto
/// inteiro, vazando a margem); quem chama precisa de `posterTruncate` depois.
/// Com duas cópias, essa regra se perde numa delas.

enum PosterAlign { left, center }

TextStyle posterStyle(
  String family,
  int weight,
  double size, {
  Color? color,
  Paint? foreground,
}) {
  return TextStyle(
    fontFamily: family,
    fontWeight: FontWeight.values[(weight ~/ 100) - 1],
    fontSize: size,
    height: 1,
    color: foreground == null ? color : null,
    foreground: foreground,
  );
}

TextPainter posterLayout(String text, TextStyle style) {
  return TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: TextDirection.ltr,
  )..layout();
}

double posterMeasure(String text, TextStyle style) =>
    posterLayout(text, style).width;

void posterFillText(
  Canvas canvas,
  String text,
  TextStyle style,
  double x,
  double baselineY, {
  PosterAlign align = PosterAlign.left,
}) {
  final painter = posterLayout(text, style);
  final dx = switch (align) {
    PosterAlign.center => x - painter.width / 2,
    PosterAlign.left => x,
  };
  final baseline = painter.computeDistanceToActualBaseline(
    TextBaseline.alphabetic,
  );
  painter.paint(canvas, Offset(dx, baselineY - baseline));
}

/// `fillText` com baseline no meio.
void posterFillTextMiddle(
  Canvas canvas,
  String text,
  TextStyle style,
  double cx,
  double cy,
) {
  final painter = posterLayout(text, style);
  painter.paint(canvas, Offset(cx - painter.width / 2, cy - painter.height / 2));
}

/// Texto com espaçamento manual entre letras. O canvas não tem letter-spacing
/// confiável, e o portal usa a mesma métrica — é o que faz as duas artes
/// baterem.
void posterTracked(
  Canvas canvas,
  String text,
  TextStyle style,
  double x,
  double baselineY,
  double spacing, {
  PosterAlign align = PosterAlign.center,
}) {
  final chars = text.characters.toList();
  if (chars.isEmpty) return;
  final widths = [for (final c in chars) posterMeasure(c, style)];
  final total =
      widths.fold<double>(0, (a, b) => a + b) + spacing * (chars.length - 1);
  var cursor = align == PosterAlign.center ? x - total / 2 : x;
  for (var i = 0; i < chars.length; i++) {
    posterFillText(canvas, chars[i], style, cursor, baselineY);
    cursor += widths[i] + spacing;
  }
}

/// Largura de um texto com espaçamento manual — a mesma conta de
/// [posterTracked], para quem precisa posicionar algo depois dele.
double posterTrackedWidth(String text, TextStyle style, double spacing) {
  final chars = text.characters.toList();
  if (chars.isEmpty) return 0;
  final widths = [for (final c in chars) posterMeasure(c, style)];
  return widths.fold<double>(0, (a, b) => a + b) + spacing * (chars.length - 1);
}

/// Reduz a fonte até o texto caber e devolve o estilo ajustado.
///
/// NÃO garante encaixe sozinho: ao chegar no piso [min] ele para e devolve o
/// texto inteiro, que então vaza a margem. Use [posterTruncate] com o estilo
/// devolvido.
TextStyle posterFitFont(
  String text,
  double maxWidth,
  double start,
  double min,
  TextStyle Function(double size) font, {
  double step = 4,
}) {
  var size = start;
  var style = font(size);
  while (size > min && posterMeasure(text, style) > maxWidth) {
    size -= step;
    style = font(size);
  }
  return style;
}

String posterTruncate(String text, TextStyle style, double maxWidth) {
  if (posterMeasure(text, style) <= maxWidth) return text;
  var result = text;
  while (result.length > 1 && posterMeasure('$result…', style) > maxWidth) {
    result = result.substring(0, result.length - 1);
  }
  return '$result…';
}
