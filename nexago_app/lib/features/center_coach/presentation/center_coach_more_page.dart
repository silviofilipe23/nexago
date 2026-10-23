import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_settings_sheet.dart'
    show confirmProfessorSignOut;
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'center_coach_agenda_page.dart' show showCenterSwitchSheet;
import 'widgets/center_mode_tab_scope.dart';

/// Linha do Mais: rótulo, resumo e para onde vai.
typedef CenterMoreItem = ({
  String key,
  IconData icon,
  String title,
  String subtitle,
  String routeName,
});

/// O que o Mais oferece para o papel no centro (G19). O que é só do painel
/// web (planos, modalidades, configurações, relatórios) não entra.
List<({String title, List<CenterMoreItem> items})> centerMoreGroups(
  CenterMembership m,
) {
  final staff = m.isManager || m.role == 'receptionist';
  final enroll = m.has('enroll_students');
  final finance = m.has('view_finance');
  return [
    (
      title: 'Comercial',
      items: [
        if (enroll)
          (
            key: 'enroll',
            icon: Icons.how_to_reg_outlined,
            title: 'Matricular aluno',
            subtitle: 'Turma, plano e a 1ª cobrança',
            routeName: AppRouteNames.centerCoachEnroll,
          ),
        if (enroll)
          (
            key: 'waitlist',
            icon: Icons.hourglass_top_rounded,
            title: 'Lista de espera',
            subtitle: 'Turmas lotadas e quem espera vaga',
            routeName: AppRouteNames.centerCoachWaitlist,
          ),
        // Gestão tem Financeiro na barra; Check-in vem para cá.
        if (staff && finance)
          (
            key: 'checkin',
            icon: Icons.qr_code_scanner_rounded,
            title: 'Check-in',
            subtitle: 'Carteirinha do aluno ou busca por nome',
            routeName: AppRouteNames.centerCoachCheckin,
          ),
      ],
    ),
    (
      title: 'Centro',
      items: [
        (
          key: 'messages',
          icon: Icons.chat_bubble_outline_rounded,
          title: 'Mensagens',
          subtitle: 'Conversas com os alunos pelo app',
          routeName: AppRouteNames.centerCoachMessages,
        ),
        if (m.isManager)
          (
            key: 'team',
            icon: Icons.badge_outlined,
            title: 'Equipe',
            subtitle: 'Professores, recepção e convites',
            routeName: AppRouteNames.centerCoachTeam,
          ),
        if (m.isManager)
          (
            key: 'alerts',
            icon: Icons.notifications_none_rounded,
            title: 'Alertas',
            subtitle: 'Pagamentos, vagas, cancelamentos e equipe',
            routeName: AppRouteNames.centerCoachAlerts,
          ),
        if (staff)
          (
            key: 'classes',
            icon: Icons.view_agenda_outlined,
            title: 'Turmas',
            subtitle: 'Ocupação e histórico de cada turma',
            routeName: AppRouteNames.centerCoachClasses,
          ),
      ],
    ),
  ];
}

/// G19 · Mais do modo Centro: atalhos do papel, trocar centro, perfil de
/// atleta (trocar papel) e sair.
class CenterCoachMorePage extends ConsumerWidget {
  const CenterCoachMorePage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(centerId));
    final active = ref.watch(activeCenterMembershipsProvider);
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);
    if (member == null) {
      return const ProfessorLinksScaffold(
        title: 'Mais',
        showBack: false,
        body: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
    }
    final others = [
      for (final m in active)
        if (m.centerId != centerId) m,
    ];
    final groups = [
      for (final g in centerMoreGroups(member))
        if (g.items.isNotEmpty) g,
    ];

    return ProfessorLinksScaffold(
      title: 'Mais',
      subtitle: [
        if (member.displayName.isNotEmpty) member.displayName.toUpperCase(),
        member.roleLabel.toUpperCase(),
      ].join(' · '),
      showBack: !CenterModeTabScope.of(context),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          for (final g in groups) ...[
            ProfessorLinksKicker(g.title),
            const SizedBox(height: 8),
            _Group(
              rows: [
                for (final i in g.items)
                  _Row(
                    key: Key('center-more-${i.key}'),
                    icon: i.icon,
                    title: i.title,
                    subtitle: i.subtitle,
                    onTap: () => context.pushNamed(
                      i.routeName,
                      pathParameters: {'centerId': centerId},
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
          ],
          if (member.isManager) ...[
            ProfessorLinksNote(
              'Planos, modalidades, quadras, configurações e relatórios '
              'ficam no painel web do centro.',
              tone: ProfessorLinksNoteTone.blue,
            ),
            const SizedBox(height: 16),
          ],
          ProfessorLinksKicker('Conta'),
          const SizedBox(height: 8),
          _Group(
            rows: [
              if (others.isNotEmpty)
                _Row(
                  key: const Key('center-more-switch'),
                  icon: Icons.swap_vert_rounded,
                  title: 'Trocar centro',
                  subtitle:
                      '${active.length} vínculos · '
                      '${active.map((m) => m.centerName).join(', ')}',
                  onTap: () => showCenterSwitchSheet(
                    context,
                    member,
                    others,
                    (id) => ref
                        .read(selectedCoachCenterIdProvider.notifier)
                        .select(id),
                  ),
                ),
              if (canSwitchRole)
                _Row(
                  key: const Key('center-more-switch-role'),
                  icon: Icons.sports_volleyball_outlined,
                  title: 'Meu perfil de atleta',
                  subtitle: 'Trocar papel · torneios, ranking e jogos',
                  onTap: () => navigateToRoleSelection(context, ref),
                ),
              _Row(
                key: const Key('center-more-sign-out'),
                icon: Icons.logout_rounded,
                title: 'Sair',
                subtitle: 'Você precisará entrar de novo',
                danger: true,
                onTap: () => confirmProfessorSignOut(context, ref),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'A conta é a mesma do app de atleta: perfil e notificações ficam '
            'nos ajustes do atleta.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.rows});

  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
            rows[i],
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = danger ? AppColors.live : colors.brandText;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Row(
          children: [
            Icon(icon, size: 20, color: accent),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: danger ? AppColors.live : colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            if (!danger)
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: ProfessorLinksStyle.dim(colors),
              ),
          ],
        ),
      ),
    );
  }
}
