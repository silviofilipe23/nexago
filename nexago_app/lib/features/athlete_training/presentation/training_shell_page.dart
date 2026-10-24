import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/theme/app_theme_colors.dart';

/// Altura da barra de Meus treinos (`NexaBottomNavBar.height`).
const double kTrainingTabBarHeight = 100;

/// Espaço no fim das listas das abas para a barra flutuante não cobrir nada.
double trainingShellBottomPadding(BuildContext context) =>
    kTrainingTabBarHeight + MediaQuery.paddingOf(context).bottom + 24;

/// Shell de Meus treinos: Treinos · Agenda · Feedbacks · Evolução ·
/// Professores (a ordem é a dos branches do `StatefulShellRoute`). As outras
/// telas de `/treinos/...` ficam fora do shell e empilham sem a barra.
class TrainingShellPage extends StatelessWidget {
  const TrainingShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: navigationShell,
      bottomNavigationBar: TrainingTabBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (branch) => navigationShell.goBranch(
          branch,
          initialLocation: branch == navigationShell.currentIndex,
        ),
      ),
    );
  }
}

/// A barra, separada do shell para ser montada em teste sem o go_router.
class TrainingTabBar extends StatelessWidget {
  const TrainingTabBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const items = [
    NexaBottomNavItem(
      label: 'Treinos',
      icon: Icons.sports_volleyball_outlined,
      selectedIcon: Icons.sports_volleyball_rounded,
      sfSymbol: 'figure.volleyball',
      selectedSfSymbol: 'figure.volleyball',
    ),
    NexaBottomNavItem(
      label: 'Agenda',
      icon: Icons.calendar_month_outlined,
      selectedIcon: Icons.calendar_month_rounded,
      sfSymbol: 'calendar',
      selectedSfSymbol: 'calendar',
    ),
    NexaBottomNavItem(
      label: 'Feedbacks',
      icon: Icons.rate_review_outlined,
      selectedIcon: Icons.rate_review_rounded,
      sfSymbol: 'text.bubble',
      selectedSfSymbol: 'text.bubble.fill',
    ),
    NexaBottomNavItem(
      label: 'Evolução',
      icon: Icons.insights_outlined,
      selectedIcon: Icons.insights_rounded,
      sfSymbol: 'chart.line.uptrend.xyaxis',
      selectedSfSymbol: 'chart.line.uptrend.xyaxis',
    ),
    NexaBottomNavItem(
      label: 'Professores',
      icon: Icons.school_outlined,
      selectedIcon: Icons.school_rounded,
      sfSymbol: 'person.2',
      selectedSfSymbol: 'person.2.fill',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return NexaBottomNavBar(
      key: const Key('training-tab-bar'),
      items: items,
      currentIndex: currentIndex,
      height: kTrainingTabBarHeight,
      onTap: onTap,
    );
  }
}
