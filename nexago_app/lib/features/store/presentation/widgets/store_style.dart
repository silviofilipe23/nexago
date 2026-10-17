import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme_colors.dart';

/// Medidas e tons da vitrine que não têm token próprio no tema — derivados
/// das cores do tema (opacidades do desenho: secundário 62%, terciário 40%,
/// superfície 4,3%).
abstract final class StoreStyle {
  StoreStyle._();

  /// Texto/ícone sobre o laranja da marca (`--nx-text-on-orange`).
  static const Color onBrand = Color(0xFF0A0A0A);

  /// Fundo do card sem foto (listrado), como no desenho.
  static const Color placeholderBase = Color(0xFF121214);

  /// Fundo do banner sem foto (listrado, tom quente), como no desenho.
  static const Color bannerPlaceholderBase = Color(0xFF16120F);

  /// Cantos da foto do card (medida do desenho).
  static const double photoRadius = 20;

  static const double photoHeight = 176;
  static const double bannerHeight = 196;
  static const double headerButton = 44;
  static const double gridGap = 12;

  static Color surface(AppThemeColors c) => c.onSurface.withValues(alpha: 0.043);
  static Color secondary(AppThemeColors c) => c.onSurface.withValues(alpha: 0.62);
  static Color tertiary(AppThemeColors c) => c.onSurface.withValues(alpha: 0.40);
}

/// Fundo listrado (diagonais de 9px a cada 18px) — o "sem foto" do desenho,
/// sem texto de placeholder.
class StoreStripedBox extends StatelessWidget {
  const StoreStripedBox({super.key, this.color = StoreStyle.placeholderBase});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _StripesPainter(color),
      child: const SizedBox.expand(),
    );
  }
}

class _StripesPainter extends CustomPainter {
  const _StripesPainter(this.base);

  final Color base;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = base);
    final stripe = Paint()
      ..color = const Color(0x08FFFFFF)
      ..strokeWidth = 9;
    // 18px medidos na perpendicular da listra (45°) viram 18·√2 na horizontal.
    final step = 18 * math.sqrt2;
    for (var x = -size.height; x < size.width + size.height; x += step) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        stripe,
      );
    }
  }

  @override
  bool shouldRepaint(_StripesPainter oldDelegate) => oldDelegate.base != base;
}
