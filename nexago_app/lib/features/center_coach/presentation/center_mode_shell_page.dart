import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../professor_mode/presentation/professor_shell_page.dart'
    show kProfessorTabBarHeight;
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'center_coach_agenda_page.dart';
import 'center_coach_checkin_page.dart';
import 'center_coach_classes_page.dart';
import 'center_coach_finance_page.dart';
import 'center_coach_more_page.dart';
import 'center_coach_students_page.dart';
import 'center_coach_today_page.dart';
import 'widgets/center_mode_tab_scope.dart';

/// Abas do modo Centro.
enum CenterModeTab { today, agenda, classes, students, finance, checkin, more }

/// Abas por papel no centro (canvas G e P): gestão e recepção abrem no Hoje,
/// com Financeiro para quem vê o financeiro e Check-in no lugar dele para a
/// recepção; o professor tem Agenda · Turmas · Alunos · Mais.
List<CenterModeTab> centerModeTabs(CenterMembership member) {
  if (member.isManager || member.role == 'receptionist') {
    return [
      CenterModeTab.today,
      CenterModeTab.agenda,
      CenterModeTab.students,
      member.has('view_finance')
          ? CenterModeTab.finance
          : CenterModeTab.checkin,
      CenterModeTab.more,
    ];
  }
  return const [
    CenterModeTab.agenda,
    CenterModeTab.classes,
    CenterModeTab.students,
    CenterModeTab.more,
  ];
}

NexaBottomNavItem _item(CenterModeTab t) => switch (t) {
  CenterModeTab.today => const NexaBottomNavItem(
    label: 'Hoje',
    icon: Icons.today_outlined,
    selectedIcon: Icons.today_rounded,
    sfSymbol: 'list.bullet.clipboard',
    selectedSfSymbol: 'pencil.and.list.clipboard',
  ),
  CenterModeTab.agenda => const NexaBottomNavItem(
    label: 'Agenda',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month_rounded,
    sfSymbol: 'calendar',
    selectedSfSymbol: 'calendar',
  ),
  CenterModeTab.classes => const NexaBottomNavItem(
    label: 'Turmas',
    icon: Icons.view_agenda_outlined,
    selectedIcon: Icons.view_agenda_rounded,
    sfSymbol: 'square.grid.2x2',
    selectedSfSymbol: 'square.grid.2x2.fill',
  ),
  CenterModeTab.students => const NexaBottomNavItem(
    label: 'Alunos',
    icon: Icons.groups_outlined,
    selectedIcon: Icons.groups_rounded,
    sfSymbol: 'person.2',
    selectedSfSymbol: 'person.2.fill',
  ),
  CenterModeTab.finance => const NexaBottomNavItem(
    label: 'Financeiro',
    icon: Icons.account_balance_wallet_outlined,
    selectedIcon: Icons.account_balance_wallet_rounded,
    sfSymbol: 'creditcard',
    selectedSfSymbol: 'creditcard.fill',
  ),
  CenterModeTab.checkin => const NexaBottomNavItem(
    label: 'Check-in',
    icon: Icons.qr_code_scanner_rounded,
    selectedIcon: Icons.qr_code_scanner_rounded,
    sfSymbol: 'qrcode.viewfinder',
    selectedSfSymbol: 'qrcode.viewfinder',
  ),
  CenterModeTab.more => const NexaBottomNavItem(
    label: 'Mais',
    icon: Icons.more_horiz_rounded,
    selectedIcon: Icons.more_horiz_rounded,
    sfSymbol: 'ellipsis',
    selectedSfSymbol: 'ellipsis.fill',
  ),
};

/// Home do modo Centro de treinamento (`/centro`): as telas do centro em
/// abas, por papel. Sem vínculo ativo cai na Agenda (que mostra o vazio ou o
/// acesso revogado, P9), sem barra. As telas empilhadas por cima (aula,
/// aluno, cobrança…) cobrem a barra.
class CenterModeShellPage extends ConsumerStatefulWidget {
  const CenterModeShellPage({super.key});

  @override
  ConsumerState<CenterModeShellPage> createState() =>
      _CenterModeShellPageState();
}

class _CenterModeShellPageState extends ConsumerState<CenterModeShellPage> {
  CenterModeTab? _tab;

  /// Abas já abertas (as outras só montam na primeira visita).
  final Set<CenterModeTab> _visited = {};

  /// Centro + papel das abas montadas; mudou, recomeça do início.
  String? _key;

  Widget _page(CenterModeTab t, String centerId) => switch (t) {
    CenterModeTab.today => CenterCoachTodayPage(centerId: centerId),
    CenterModeTab.agenda => const CenterCoachAgendaPage(),
    CenterModeTab.classes => CenterCoachClassesPage(centerId: centerId),
    CenterModeTab.students => CenterCoachStudentsPage(centerId: centerId),
    CenterModeTab.finance => CenterCoachFinancePage(centerId: centerId),
    CenterModeTab.checkin => CenterCoachCheckinPage(centerId: centerId),
    CenterModeTab.more => CenterCoachMorePage(centerId: centerId),
  };

  @override
  Widget build(BuildContext context) {
    ref.watch(centerRoleSyncProvider);
    final member = ref.watch(currentCenterMembershipProvider);
    if (member == null) return const CenterCoachAgendaPage();

    final tabs = centerModeTabs(member);
    final key = '${member.centerId}|${member.role}|${tabs.join(',')}';
    if (key != _key) {
      _key = key;
      _tab = tabs.first;
      _visited.clear();
    }
    final current = tabs.contains(_tab) ? _tab! : tabs.first;
    _visited.add(current);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: IndexedStack(
        index: tabs.indexOf(current),
        children: [
          for (final t in tabs)
            _visited.contains(t)
                ? CenterModeTabScope(
                    key: ValueKey('center-tab-${member.centerId}-${t.name}'),
                    child: _page(t, member.centerId),
                  )
                : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: NexaBottomNavBar(
        key: const Key('center-mode-tab-bar'),
        items: [for (final t in tabs) _item(t)],
        currentIndex: tabs.indexOf(current),
        uppercaseLabels: true,
        height: kProfessorTabBarHeight,
        onTap: (i) => setState(() => _tab = tabs[i]),
      ),
    );
  }
}
