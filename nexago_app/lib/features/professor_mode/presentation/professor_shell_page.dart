import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';

/// Altura da barra do modo Professor (`NexaBottomNavBar.height`).
const double kProfessorTabBarHeight = 100;

/// Espaço no fim das listas das abas para a barra flutuante não cobrir nada.
double professorShellBottomPadding(BuildContext context) =>
    kProfessorTabBarHeight + MediaQuery.paddingOf(context).bottom + 24;

/// Telas empilhadas (aluno, turmas) ocupam a tela inteira, sem a barra.
bool shouldHideProfessorTabBar(String path) =>
    path.startsWith('${AppRoutes.professorAgenda}/') ||
    path.startsWith('${AppRoutes.professorStudents}/') ||
    path.startsWith('${AppRoutes.professorMore}/');

/// Shell do modo Professor: Hoje · Agenda · Alunos · Mais (a ordem é a dos
/// branches do `StatefulShellRoute` no router).
class ProfessorShellPage extends StatelessWidget {
  const ProfessorShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final hide = shouldHideProfessorTabBar(GoRouterState.of(context).uri.path);
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: navigationShell,
      bottomNavigationBar: hide
          ? null
          : ProfessorTabBar(
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
class ProfessorTabBar extends StatelessWidget {
  const ProfessorTabBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const items = [
    NexaBottomNavItem(
      label: 'Hoje',
      icon: Icons.today_outlined,
      selectedIcon: Icons.today_rounded,
      sfSymbol: 'calendar.day.timeline.left',
      selectedSfSymbol: 'calendar.day.timeline.left',
    ),
    NexaBottomNavItem(
      label: 'Agenda',
      icon: Icons.calendar_month_outlined,
      selectedIcon: Icons.calendar_month_rounded,
      sfSymbol: 'calendar',
      selectedSfSymbol: 'calendar',
    ),
    NexaBottomNavItem(
      label: 'Alunos',
      icon: Icons.groups_outlined,
      selectedIcon: Icons.groups_rounded,
      sfSymbol: 'person.2',
      selectedSfSymbol: 'person.2.fill',
    ),
    NexaBottomNavItem(
      label: 'Mais',
      icon: Icons.menu_rounded,
      selectedIcon: Icons.menu_rounded,
      sfSymbol: 'line.3.horizontal',
      selectedSfSymbol: 'line.3.horizontal',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return NexaBottomNavBar(
      items: items,
      currentIndex: currentIndex,
      uppercaseLabels: true,
      height: kProfessorTabBarHeight,
      onTap: onTap,
    );
  }
}
