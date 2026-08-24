import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Controla o encolhimento da tab bar ao rolar o conteúdo (0 = expandida, 1 = compacta).
class ShellTabBarCollapseController extends ChangeNotifier {
  ShellTabBarCollapseController();

  static const double expandedHeight = 64;
  static const double collapsedHeight = 50;

  double _progress = 0;
  bool _notifyScheduled = false;
  bool _isScrolling = false;

  double get progress => _progress;

  double get height => _lerp(expandedHeight, collapsedHeight, _progress);

  bool get showLabels => _progress < 0.45;

  /// Verdadeiro do início do gesto/inércia até o scroll assentar de vez —
  /// usado pra suspender o blur ao vivo da cápsula (custo de raster por
  /// frame) enquanto o conteúdo por trás dela está se movendo.
  bool get isScrolling => _isScrolling;

  void expand() => _setProgress(0);

  bool handleScrollNotification(ScrollNotification notification) {
    if (notification.depth != 0) return false;

    if (notification is ScrollStartNotification) {
      _setScrolling(true);
      return false;
    }

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
      _setScrolling(false);
      final metrics = notification.metrics;
      if (metrics.pixels <= metrics.minScrollExtent + 2) {
        _setProgress(0);
        return false;
      }
      _setProgress(_progress >= 0.35 ? 1.0 : 0.0);
    }

    return false;
  }

  void _setScrolling(bool value) {
    if (_isScrolling == value) return;
    _isScrolling = value;
    _scheduleNotify();
  }

  void _setProgress(double value) {
    final clamped = value.clamp(0.0, 1.0);
    if ((clamped - _progress).abs() < 0.008) return;
    _progress = clamped;
    _scheduleNotify();
  }

  /// Evita `notifyListeners` durante layout/paint (ex.: scroll end no viewport).
  void _scheduleNotify() {
    if (SchedulerBinding.instance.schedulerPhase == SchedulerPhase.idle) {
      notifyListeners();
      return;
    }
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _notifyScheduled = false;
      notifyListeners();
    });
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
