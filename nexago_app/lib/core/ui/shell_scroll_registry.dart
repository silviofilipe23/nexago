import 'package:flutter/material.dart';

/// Um [ScrollController] por aba do shell — usado para voltar ao topo no menu.
class ShellScrollRegistry {
  ShellScrollRegistry(int tabCount)
      : _controllers = List.generate(tabCount, (_) => ScrollController());

  final List<ScrollController> _controllers;

  ScrollController controllerFor(int index) {
    assert(index >= 0 && index < _controllers.length);
    return _controllers[index];
  }

  void scrollToTop(int index) {
    if (index < 0 || index >= _controllers.length) return;
    final controller = _controllers[index];
    if (!controller.hasClients) return;
    controller.animateTo(
      0,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
  }
}
