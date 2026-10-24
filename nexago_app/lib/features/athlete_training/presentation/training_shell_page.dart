import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../application/athlete_training_providers.dart';

/// Altura da barra de Meus treinos (`NexaBottomNavBar.height`).
const double kTrainingTabBarHeight = 100;

/// Espaço no fim das listas das abas para a barra flutuante não cobrir nada.
double trainingShellBottomPadding(BuildContext context) =>
    kTrainingTabBarHeight + MediaQuery.paddingOf(context).bottom + 24;

/// Shell de Meus treinos: Treinos · Agenda · Feedbacks · Evolução · Mais (a ordem é a dos branches do `StatefulShellRoute`). As outras
/// telas de `/treinos/...` ficam fora do shell e empilham sem a barra.
class TrainingShellPage extends ConsumerWidget {
  const TrainingShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingReviews = ref.watch(pendingClassReviewsProvider)?.length ?? 0;
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: navigationShell,
      bottomNavigationBar: TrainingTabBar(
        moreBadge: pendingReviews,
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
    this.moreBadge = 0,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  /// Treinos para avaliar: a lista fica no Mais (Minhas avaliações).
  final int moreBadge;

  /// Índice da aba Mais.
  static const int moreIndex = 4;

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
      label: 'Mais',
      icon: Icons.more_horiz_rounded,
      selectedIcon: Icons.more_horiz_rounded,
      sfSymbol: 'ellipsis',
      selectedSfSymbol: 'ellipsis',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return NexaBottomNavBar(
      key: const Key('training-tab-bar'),
      items: [
        for (var i = 0; i < items.length; i++)
          i == moreIndex && moreBadge > 0
              ? NexaBottomNavItem(
                  label: items[i].label,
                  icon: items[i].icon,
                  selectedIcon: items[i].selectedIcon,
                  sfSymbol: items[i].sfSymbol,
                  selectedSfSymbol: items[i].selectedSfSymbol,
                  badge: moreBadge > 99 ? '99+' : '$moreBadge',
                )
              : items[i],
      ],
      currentIndex: currentIndex,
      height: kTrainingTabBarHeight,
      onTap: onTap,
    );
  }
}
