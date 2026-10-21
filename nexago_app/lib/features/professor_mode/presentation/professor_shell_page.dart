import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../messages/application/messages_providers.dart';

/// Altura da barra do modo Professor (`NexaBottomNavBar.height`).
const double kProfessorTabBarHeight = 100;

/// Espaço no fim das listas das abas para a barra flutuante não cobrir nada.
double professorShellBottomPadding(BuildContext context) =>
    kProfessorTabBarHeight + MediaQuery.paddingOf(context).bottom + 24;

/// Telas empilhadas (aluno, turmas) ocupam a tela inteira, sem a barra.
bool shouldHideProfessorTabBar(String path) =>
    path.startsWith('${AppRoutes.professorAgenda}/') ||
    path.startsWith('${AppRoutes.professorMessages}/') ||
    path.startsWith('${AppRoutes.professorStudents}/') ||
    path.startsWith('${AppRoutes.professorMore}/');

/// Shell do modo Professor: Hoje · Agenda · Alunos · Mensagens · Mais (a
/// ordem é a dos branches do `StatefulShellRoute` no router).
class ProfessorShellPage extends ConsumerWidget {
  const ProfessorShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hide = shouldHideProfessorTabBar(GoRouterState.of(context).uri.path);
    final unread = ref.watch(unreadMessagesCountProvider);
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: navigationShell,
      bottomNavigationBar: hide
          ? null
          : ProfessorTabBar(
              messagesBadge: unread,
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
    this.messagesBadge = 0,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  /// Não lidas na aba Mensagens (o badge aparece onde a barra suporta).
  final int messagesBadge;

  /// Índice da aba Mensagens.
  static const int messagesIndex = 3;

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
      label: 'Mensagens',
      icon: Icons.chat_bubble_outline_rounded,
      selectedIcon: Icons.chat_bubble_rounded,
      sfSymbol: 'bubble.left',
      selectedSfSymbol: 'bubble.left.fill',
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
      items: [
        for (var i = 0; i < items.length; i++)
          i == messagesIndex && messagesBadge > 0
              ? NexaBottomNavItem(
                  label: items[i].label,
                  icon: items[i].icon,
                  selectedIcon: items[i].selectedIcon,
                  sfSymbol: items[i].sfSymbol,
                  selectedSfSymbol: items[i].selectedSfSymbol,
                  badge: messagesBadge > 99 ? '99+' : '$messagesBadge',
                )
              : items[i],
      ],
      currentIndex: currentIndex,
      uppercaseLabels: true,
      height: kProfessorTabBarHeight,
      onTap: onTap,
    );
  }
}
