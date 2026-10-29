import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Escala geral do texto do app: [factor] do tamanho escrito no código, sem
/// descer do [floor] — e por cima da escala de texto do sistema.
///
/// O app tem milhares de `fontSize` fixos espalhados pelas telas; reduzir
/// token por token não mudaria o que o atleta vê. Aqui o ajuste é um só, na
/// raiz:
/// - acima do piso, o texto fica em [factor] (16 → 14,4; 22 → 19,8);
/// - nada desce abaixo de [floor], e o que já está nele ou abaixo (selos de
///   10–11px, o piso de legibilidade do #1033) não muda;
/// - quem aumentou a fonte nos ajustes do celular continua vendo maior: o
///   resultado passa por [system] no fim.
///
/// Cards que viram imagem usam `TextScaler.noScaling` e ficam de fora.
class AppTextScaler extends TextScaler {
  const AppTextScaler(
    this.system, {
    this.factor = defaultFactor,
    this.floor = defaultFloor,
  });

  /// "A fonte está muito grande" (dono, 29/10/2026): 90% do desenhado.
  static const double defaultFactor = 0.9;
  static const double defaultFloor = 11;

  final TextScaler system;
  final double factor;
  final double floor;

  @override
  double scale(double fontSize) {
    final reduced =
        fontSize <= floor ? fontSize : math.max(fontSize * factor, floor);
    return system.scale(reduced);
  }

  @override
  // ignore: deprecated_member_use — a interface ainda exige o getter.
  double get textScaleFactor => system.textScaleFactor * factor;

  @override
  bool operator ==(Object other) =>
      other is AppTextScaler &&
      other.system == system &&
      other.factor == factor &&
      other.floor == floor;

  @override
  int get hashCode => Object.hash(system, factor, floor);

  @override
  String toString() => 'AppTextScaler($factor, piso $floor, sistema $system)';
}

/// Aplica [AppTextScaler] a tudo abaixo — vai no `builder` do MaterialApp.
class AppTextScale extends StatelessWidget {
  const AppTextScale({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    // Não embrulha duas vezes (hot reload, rotas que reconstroem o builder).
    final system = media.textScaler is AppTextScaler
        ? (media.textScaler as AppTextScaler).system
        : media.textScaler;
    return MediaQuery(
      data: media.copyWith(textScaler: AppTextScaler(system)),
      child: child,
    );
  }
}
