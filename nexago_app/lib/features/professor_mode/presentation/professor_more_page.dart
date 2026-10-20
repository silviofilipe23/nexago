import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_students_providers.dart';
import '../application/professor_wallet_providers.dart';
import '../domain/professor_wallet.dart';
import '../domain/professor_wallet_logic.dart';
import '../domain/professor_mode_logic.dart';
import '../domain/professor_students.dart';
import 'actions/professor_action_widgets.dart';
import 'professor_shell_page.dart';
import 'widgets/professor_settings_sheet.dart';
import 'widgets/professor_students_widgets.dart';

/// Aba Mais do modo Professor (B1): o professor, Turmas, o dinheiro da
/// carteira própria (só independente), Minhas arenas e a conta.
class ProfessorMorePage extends ConsumerWidget {
  const ProfessorMorePage({super.key});

  Future<void> _openForArena(
    BuildContext context,
    List<ProfessorArenaSummary> arenas,
    String routeName,
  ) async {
    final arenaId = await pickProfessorActionArena(context, arenas);
    if (arenaId == null || !context.mounted) return;
    context.pushNamed(routeName, pathParameters: {'arenaId': arenaId});
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final name = profile == null
        ? 'Professor'
        : athleteDisplayName(profile, fallback: 'Professor');
    final now = ref.watch(professorLinksClockProvider)();
    final links = ref.watch(myProfessorLinksProvider).valueOrNull;
    final snapshot = ref.watch(professorStudentsProvider).valueOrNull;
    final canSwitchRole = ref.watch(hasMultipleMobileRolesProvider);

    final invites = links == null ? 0 : professorOpenInvites(links, now).length;
    final activeArenas =
        links == null ? null : professorActiveLinkCount(links, now);
    final classes = snapshot?.classes;
    final waiting =
        classes?.fold<int>(0, (sum, c) => sum + c.waitlistCount) ?? 0;
    final actionArenas = snapshot?.actionArenas ?? const [];

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Mais',
              style: ProfessorLinksStyle.display(24, color: colors.onSurface),
            ),
            const SizedBox(height: 3),
            Text(
              'MODO PROFESSOR',
              style: ProfessorLinksStyle.mono(
                10.5,
                color: ProfessorLinksStyle.dim(colors),
              ).copyWith(letterSpacing: 0.8),
            ),
          ],
        ),
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            professorShellBottomPadding(context),
          ),
          children: [
            ProfessorLinksCard(
              child: Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(name),
                    photoUrl: profile?.avatarUrl,
                    size: 48,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            16,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const ProfessorMutedText(
                          'Perfil e conta ficam no modo Atleta.',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            _Group(
              title: 'Alunos e aulas',
              rows: [
                _MenuRow(
                  key: const Key('professor-more-classes'),
                  icon: Icons.view_agenda_outlined,
                  title: 'Turmas',
                  trailing: classes == null
                      ? null
                      : [
                          '${classes.length} turma${classes.length == 1 ? '' : 's'}',
                          if (waiting > 0) '$waiting na espera',
                        ].join(' · '),
                  trailingColor: waiting > 0 ? AppColors.pending : null,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.professorClasses),
                ),
              ],
            ),
            if (actionArenas.isNotEmpty) ...[
              const SizedBox(height: 22),
              _Group(
                title: 'Ações na arena',
                rows: [
                  if (actionArenas.any((a) =>
                      a.actions.canEnrollStudents ||
                      a.actions.canScheduleLessons))
                    _MenuRow(
                      key: const Key('professor-more-add-student'),
                      icon: Icons.person_add_alt_1_outlined,
                      title: 'Adicionar aluno',
                      onTap: () =>
                          context.pushNamed(AppRouteNames.professorAddStudent),
                    ),
                  if (actionArenas.any((a) => a.actions.canScheduleLessons))
                    _MenuRow(
                      key: const Key('professor-more-new-lesson'),
                      icon: Icons.event_available_outlined,
                      title: 'Nova aula',
                      onTap: () => _openForArena(
                        context,
                        actionArenas
                            .where((a) => a.actions.canScheduleLessons)
                            .toList(),
                        AppRouteNames.professorNewLesson,
                      ),
                    ),
                  if (actionArenas.any((a) => a.actions.canCancelLessons))
                    _MenuRow(
                      key: const Key('professor-more-notice'),
                      icon: Icons.campaign_outlined,
                      title: 'Comunicado',
                      onTap: () => _openForArena(
                        context,
                        actionArenas
                            .where((a) => a.actions.canCancelLessons)
                            .toList(),
                        AppRouteNames.professorNotice,
                      ),
                    ),
                ],
              ),
            ],
            if (ref.watch(professorWalletVisibleProvider)) ...[
              const SizedBox(height: 22),
              const _MoneyGroup(),
            ],
            const SizedBox(height: 22),
            _Group(
              title: 'Arenas',
              rows: [
                _MenuRow(
                  key: const Key('professor-more-arenas'),
                  icon: Icons.place_outlined,
                  title: 'Minhas arenas',
                  trailing: invites > 0
                      ? '$invites convite${invites == 1 ? '' : 's'}'
                      : activeArenas == null
                          ? null
                          : '$activeArenas ativa${activeArenas == 1 ? '' : 's'}',
                  trailingColor: invites > 0 ? AppColors.brandHover : null,
                  onTap: () => context.pushNamed(AppRouteNames.professorArenas),
                ),
              ],
            ),
            const SizedBox(height: 22),
            _Group(
              title: 'Conta',
              rows: [
                if (canSwitchRole)
                  _MenuRow(
                    key: const Key('professor-more-switch-role'),
                    icon: Icons.swap_horiz_rounded,
                    title: 'Trocar papel',
                    onTap: () => navigateToRoleSelection(context, ref),
                  ),
                _MenuRow(
                  key: const Key('professor-more-sign-out'),
                  icon: Icons.logout_rounded,
                  title: 'Sair',
                  danger: true,
                  onTap: () => confirmProfessorSignOut(context, ref),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Mais › Dinheiro (fase 3): conta Asaas, planos e a carteira própria.
class _MoneyGroup extends ConsumerWidget {
  const _MoneyGroup();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountAsync = ref.watch(professorPayoutAccountProvider);
    final account = accountAsync.valueOrNull;
    final plans = ref.watch(professorWalletPlansProvider).valueOrNull;
    final charges = ref.watch(professorWalletChargesProvider).valueOrNull;
    final todayKey = ref.watch(professorWalletTodayKeyProvider);
    final activePlans = plans?.where((p) => p.active).length;
    final summary = charges == null
        ? null
        : professorWalletSummary(charges, todayKey: todayKey);
    final accountColor = switch (account?.status) {
      ProfessorAccountStatus.approved => AppColors.win,
      ProfessorAccountStatus.rejected => AppColors.live,
      ProfessorAccountStatus.pending ||
      ProfessorAccountStatus.creating =>
        AppColors.pending,
      ProfessorAccountStatus.failed || null => AppColors.brandHover,
    };
    return _Group(
      title: 'Dinheiro',
      rows: [
        _MenuRow(
          key: const Key('professor-more-payout'),
          icon: Icons.account_balance_outlined,
          title: 'Receber pelo nexaGO',
          trailing: !accountAsync.hasValue
              ? null
              : account == null ||
                      account.status == ProfessorAccountStatus.failed
                  ? 'Criar conta'
                  : professorAccountStatusLabel(account.status),
          trailingColor: accountColor,
          onTap: () => context.pushNamed(AppRouteNames.professorPayoutAccount),
        ),
        _MenuRow(
          key: const Key('professor-more-plans'),
          icon: Icons.sell_outlined,
          title: 'Meus planos e preços',
          trailing: activePlans == null
              ? null
              : '$activePlans plano${activePlans == 1 ? '' : 's'}',
          onTap: () => context.pushNamed(AppRouteNames.professorWalletPlans),
        ),
        _MenuRow(
          key: const Key('professor-more-wallet'),
          icon: Icons.account_balance_wallet_outlined,
          title: 'Carteira própria',
          trailing: summary == null || summary.toReceive <= 0
              ? null
              : '${formatBRL(summary.toReceive)} a receber',
          trailingColor:
              (summary?.overdue.isNotEmpty ?? false) ? AppColors.live : null,
          onTap: () => context.pushNamed(AppRouteNames.professorWallet),
        ),
      ],
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.rows});

  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksKicker(title),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: ProfessorRowsBlock(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
                rows[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.trailing,
    this.trailingColor,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String? trailing;
  final Color? trailingColor;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = danger ? AppColors.live : colors.onSurface;
    return InkWell(
      onTap: onTap,
      child: SizedBox(
        height: 50,
        child: Row(
          children: [
            Icon(
              icon,
              size: 19,
              color: danger ? AppColors.live : ProfessorLinksStyle.mute(colors),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: ProfessorLinksStyle.display(
                  13.5,
                  weight: FontWeight.w600,
                  color: fg,
                ),
              ),
            ),
            if (trailing != null) ...[
              Text(
                trailing!,
                style: ProfessorLinksStyle.mono(
                  10,
                  weight: FontWeight.w600,
                  color: trailingColor ?? ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(width: 6),
            ],
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
