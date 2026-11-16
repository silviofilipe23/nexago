/// Cor da marca do parceiro, em ARGB inteiro (domínio sem Flutter). A tela
/// converte para `Color` e cai no laranja da NexaGO quando o valor é `null`.
library;

import 'dart:math' as math;

final RegExp _hexColor = RegExp(r'^#([0-9A-Fa-f]{6})$');

/// `#RRGGBB` → ARGB opaco; `null` quando o texto não está nesse formato.
int? parseBrandColorArgb(String? hex) {
  final match = _hexColor.firstMatch(hex?.trim() ?? '');
  if (match == null) return null;
  return 0xFF000000 | int.parse(match.group(1)!, radix: 16);
}

/// Luminância relativa (WCAG 2.x) de uma cor ARGB.
double relativeLuminance(int argb) {
  double channel(int shift) {
    final c = ((argb >> shift) & 0xFF) / 255;
    return c <= 0.03928
        ? c / 12.92
        : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/// Razão de contraste WCAG entre duas cores ARGB (1 a 21).
double contrastRatio(int a, int b) {
  final la = relativeLuminance(a);
  final lb = relativeLuminance(b);
  final lighter = math.max(la, lb);
  final darker = math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/// Entre [light] e [dark], a tinta que mais contrasta com [background]: texto
/// branco no roxo da Fast e no azul da LinQ, quase preto no laranja.
int pickForeground(int background, {required int light, required int dark}) =>
    contrastRatio(background, light) >= contrastRatio(background, dark)
    ? light
    : dark;
