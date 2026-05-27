import 'package:flutter/material.dart';

/// Anima remoção (fade + slide + colapso de altura) antes de persistir dismiss.
class AnimatedNotificationRemoval extends StatefulWidget {
  const AnimatedNotificationRemoval({
    super.key,
    required this.isRemoving,
    required this.onRemoved,
    required this.child,
  });

  final bool isRemoving;
  final VoidCallback onRemoved;
  final Widget child;

  @override
  State<AnimatedNotificationRemoval> createState() =>
      _AnimatedNotificationRemovalState();
}

class _AnimatedNotificationRemovalState extends State<AnimatedNotificationRemoval>
    with SingleTickerProviderStateMixin {
  static const _duration = Duration(milliseconds: 320);

  late final AnimationController _controller;
  late final Animation<double> _sizeFactor;
  late final Animation<double> _opacity;
  late final Animation<Offset> _slide;
  bool _removalNotified = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: _duration);
    _sizeFactor = Tween<double>(begin: 1, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInCubic),
    );
    _opacity = Tween<double>(begin: 1, end: 0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0, 0.9, curve: Curves.easeOut),
      ),
    );
    _slide = Tween<Offset>(
      begin: Offset.zero,
      end: const Offset(0.06, -0.04),
    ).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInCubic),
    );
    _controller.addStatusListener(_onStatus);
  }

  @override
  void didUpdateWidget(covariant AnimatedNotificationRemoval oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isRemoving && !oldWidget.isRemoving) {
      _removalNotified = false;
      _controller.forward(from: 0);
    }
  }

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || _removalNotified) return;
    _removalNotified = true;
    widget.onRemoved();
  }

  @override
  void dispose() {
    _controller.removeStatusListener(_onStatus);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizeTransition(
      sizeFactor: _sizeFactor,
      axisAlignment: -1,
      child: FadeTransition(
        opacity: _opacity,
        child: SlideTransition(
          position: _slide,
          child: widget.child,
        ),
      ),
    );
  }
}
