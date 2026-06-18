import 'package:flutter/material.dart';

/// Controla o encolhimento da tab bar ao rolar o conteúdo (0 = expandida, 1 = compacta).
class ShellTabBarCollapseController extends ChangeNotifier {
  ShellTabBarCollapseController();

  static const double expandedHeight = 64;
  static const double collapsedHeight = 50;

  double _progress = 0;

  double get progress => _progress;

  double get height => _lerp(expandedHeight, collapsedHeight, _progress);

  bool get showLabels => _progress < 0.45;

  void expand() => _setProgress(0);

  bool handleScrollNotification(ScrollNotification notification) {
    if (notification.depth != 0) return false;

    if (notification is ScrollUpdateNotification) {
      final metrics = notification.metrics;
      if (metrics.pixels <= metrics.minScrollExtent + 2) {
        _setProgress(0);
        return false;
      }

      final delta = notification.scrollDelta ?? 0;
      if (delta == 0) return false;
      _setProgress((_progress + delta / 90).clamp(0.0, 1.0));
      return false;
    }

    if (notification is ScrollEndNotification) {
      final metrics = notification.metrics;
      if (metrics.pixels <= metrics.minScrollExtent + 2) {
        _setProgress(0);
        return false;
      }
      _setProgress(_progress >= 0.35 ? 1.0 : 0.0);
    }

    return false;
  }

  void _setProgress(double value) {
    final clamped = value.clamp(0.0, 1.0);
    if ((clamped - _progress).abs() < 0.008) return;
    _progress = clamped;
    notifyListeners();
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
}

/// Escuta [ScrollNotification] do corpo do shell e atualiza [controller].
class ShellTabBarCollapseListener extends StatelessWidget {
  const ShellTabBarCollapseListener({
    super.key,
    required this.controller,
    required this.child,
  });

  final ShellTabBarCollapseController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return NotificationListener<ScrollNotification>(
      onNotification: controller.handleScrollNotification,
      child: child,
    );
  }
}
