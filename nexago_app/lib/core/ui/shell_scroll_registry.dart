import 'package:flutter/material.dart';

import '../layout/shell_tab_bar_collapse.dart';

/// Um [ScrollController] por aba do shell — usado para voltar ao topo no menu.
class ShellScrollRegistry {
  ShellScrollRegistry(int tabCount)
      : _controllers = List.generate(tabCount, (_) => ScrollController()),
        tabBarCollapse = ShellTabBarCollapseController();

  final List<ScrollController> _controllers;
  final ShellTabBarCollapseController tabBarCollapse;

  ScrollController controllerFor(int index) {
    assert(index >= 0 && index < _controllers.length);
    return _controllers[index];
  }

  void scrollToTop(int index) {
    if (index < 0 || index >= _controllers.length) return;
    tabBarCollapse.expand();
    final controller = _controllers[index];
    if (!controller.hasClients) return;
    controller.animateTo(
      0,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void dispose() {
    tabBarCollapse.dispose();
    for (final controller in _controllers) {
      controller.dispose();
    }
  }
}
