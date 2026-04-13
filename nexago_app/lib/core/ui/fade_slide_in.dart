import 'package:flutter/material.dart';

/// Entrada suave: fade + deslocamento vertical em pixels.
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 420),
    this.offsetY = 14,
  });

  final Widget child;
  final Duration delay;
  final Duration duration;
  final double offsetY;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: widget.duration);
    Future<void>(() async {
      if (widget.delay > Duration.zero) {
        await Future<void>.delayed(widget.delay);
      }
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, widget.offsetY * (1 - t)),
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}

/// Item de lista com atraso escalonado.
Widget staggeredFadeSlide({
  required int index,
  required Widget child,
  int staggerMs = 48,
  double offsetY = 18,
}) {
  return FadeSlideIn(
    delay: Duration(milliseconds: index * staggerMs),
    offsetY: offsetY,
    child: child,
  );
}
