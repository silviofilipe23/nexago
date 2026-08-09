import 'package:flutter/material.dart';

import '../theme/app_motion.dart';
import '../theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Bloco de skeleton com pulso suave — o placeholder de loading padrão.
///
/// Use no lugar de `CircularProgressIndicator` sempre que o layout final
/// da seção for conhecido (lista, card, linha de texto).
class NexaSkeleton extends StatefulWidget {
  const NexaSkeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = AppRadii.smAll,
    this.margin,
  }) : _circleSize = null;

  const NexaSkeleton.circle({super.key, required double size, this.margin})
      : width = size,
        height = size,
        radius = AppRadii.pillAll,
        _circleSize = size;

  final double? width;
  final double height;
  final BorderRadius radius;
  final EdgeInsetsGeometry? margin;
  // ignore: unused_field — documenta a intenção do construtor nomeado.
  final double? _circleSize;

  @override
  State<NexaSkeleton> createState() => _NexaSkeletonState();
}

class _NexaSkeletonState extends State<NexaSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.slow * 2,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_controller.value);
        return Container(
          width: widget.width,
          height: widget.height,
          margin: widget.margin,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted
                .withValues(alpha: 0.08 + 0.08 * t),
            borderRadius: widget.radius,
          ),
        );
      },
    );
  }
}
