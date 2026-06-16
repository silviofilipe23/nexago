import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../organizer_tournament_navigation.dart';
import '../widgets/organizer_team_dual_avatars.dart';

Future<void> showOrganizerTeamActionsSheet(
  BuildContext context, {
  required String tournamentId,
  required String categoryId,
  required OrganizerCategoryTeamRow team,
  required int rank,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _OrganizerTeamActionsSheet(
      tournamentId: tournamentId,
      categoryId: categoryId,
      team: team,
      rank: rank,
    ),
  );
}

class _OrganizerTeamActionsSheet extends ConsumerStatefulWidget {
  const _OrganizerTeamActionsSheet({
    required this.tournamentId,
    required this.categoryId,
    required this.team,
    required this.rank,
  });

  final String tournamentId;
  final String categoryId;
  final OrganizerCategoryTeamRow team;
  final int rank;

  @override
  ConsumerState<_OrganizerTeamActionsSheet> createState() =>
      _OrganizerTeamActionsSheetState();
}

class _OrganizerTeamActionsSheetState
    extends ConsumerState<_OrganizerTeamActionsSheet> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String success) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) {
        Navigator.pop(context);
        showAppSnackBar(context, success);
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openSeeding() {
    Navigator.pop(context);
    pushOrganizerCategorySeeding(
      GoRouter.of(context),
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.read(organizerCategoryOpsServiceProvider);
    final team = widget.team;
    final isPaid = team.status == OrganizerTeamRegistrationStatus.confirmed;
    final isWaitlist = team.status == OrganizerTeamRegistrationStatus.waitlist;
    final hasSeed = team.seedRank != null;
    final paymentSubtitle = teamPaymentActionSubtitle(team);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 8,
          bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.25,
                  ),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            _TeamActionsHeader(team: team, rank: widget.rank),
            const SizedBox(height: 8),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _ActionRow(
              enabled: !_busy,
              icon: Icons.emoji_events_outlined,
              iconColor: hasSeed ? AppColors.brand : context.themeColors.onSurface,
              iconBackground: hasSeed
                  ? AppColors.brand.withValues(alpha: 0.14)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
              title: 'Definir cabeça de chave',
              titleColor: hasSeed ? AppColors.brand : null,
              subtitle: teamSeedActionSubtitle(team.seedRank),
              trailing: hasSeed
                  ? Text(
                      'C${team.seedRank}',
                      style: AppTypography.mono(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    )
                  : null,
              onTap: _openSeeding,
            ),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _ActionRow(
              enabled: !_busy && !isPaid,
              icon: Icons.account_balance_wallet_outlined,
              title: isPaid ? 'Pagamento confirmado' : 'Confirmar pagamento',
              subtitle: isPaid
                  ? paymentSubtitle
                  : 'Marcar como pago · $paymentSubtitle',
              trailing: isPaid
                  ? Icon(Icons.check_rounded, color: AppColors.win, size: 20)
                  : null,
              onTap: isPaid
                  ? null
                  : () => _run(
                        () => service.confirmRegistrationPayment(
                          registrationId: team.registrationId,
                        ),
                        'Pagamento confirmado.',
                      ),
            ),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _ActionRow(
              enabled: !_busy,
              icon: Icons.hub_outlined,
              title: 'Enviar mensagem',
              subtitle: 'Push + WhatsApp para a dupla',
              onTap: () => Navigator.pop(context),
            ),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _ActionRow(
              enabled: !_busy,
              icon: Icons.edit_outlined,
              title: 'Editar inscrição',
              subtitle: 'Trocar parceiro, nível ou cidade',
              onTap: () {
                Navigator.pop(context);
                showAppSnackBar(context, 'Edição em breve.');
              },
            ),
            if (!isWaitlist) ...[
              Divider(
                height: 1,
                color:
                    context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
              _ActionRow(
                enabled: !_busy,
                icon: Icons.format_list_bulleted_rounded,
                title: 'Mover para lista de espera',
                subtitle: 'Libera a vaga e promove a próxima da fila',
                onTap: () => _run(
                  () => service.moveToWaitlist(
                    registrationId: team.registrationId,
                  ),
                  'Dupla movida para fila.',
                ),
              ),
            ],
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            _ActionRow(
              enabled: !_busy,
              icon: Icons.delete_outline_rounded,
              iconColor: AppColors.live,
              iconBackground: AppColors.live.withValues(alpha: 0.12),
              title: 'Remover da categoria',
              titleColor: AppColors.live,
              subtitle: 'Reembolsa e cancela a inscrição',
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Remover da categoria?'),
                    content: const Text(
                      'A inscrição será cancelada e a vaga liberada.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancelar'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Remover'),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  await _run(
                    () => service.removeFromCategory(
                      registrationId: team.registrationId,
                    ),
                    'Dupla removida.',
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TeamActionsHeader extends StatelessWidget {
  const _TeamActionsHeader({required this.team, required this.rank});

  final OrganizerCategoryTeamRow team;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final isTopRank = rank <= 3;
    final rankColor = isTopRank
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55);
    final pts = teamCombinedRankingPoints(team);
    final registered = team.registeredAt;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isTopRank
                ? AppColors.brand.withValues(alpha: 0.14)
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: rankColor.withValues(alpha: isTopRank ? 0.45 : 0.2),
            ),
          ),
          child: Text(
            '$rank',
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: rankColor,
            ),
          ),
        ),
        const SizedBox(width: 10),
        OrganizerTeamDualAvatars(
          player1: team.player1,
          player2: team.player2,
          overlapRingColor: context.themeColors.surfaceCard,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                team.displayName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 4),
              _HeaderMetaLine(
                seedRank: team.seedRank,
                registeredAt: registered,
                rankingPoints: pts,
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        _StatusPill(status: team.status),
      ],
    );
  }
}

class _HeaderMetaLine extends StatelessWidget {
  const _HeaderMetaLine({
    required this.seedRank,
    required this.registeredAt,
    required this.rankingPoints,
  });

  final int? seedRank;
  final DateTime? registeredAt;
  final int rankingPoints;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final children = <InlineSpan>[];

    if (seedRank != null) {
      children.add(
        TextSpan(
          text: 'CAB. $seedRank',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: AppColors.brand,
            letterSpacing: 0.3,
          ),
        ),
      );
    }

    if (registeredAt != null) {
      if (children.isNotEmpty) {
        children.add(TextSpan(text: ' · ', style: _mutedStyle(muted)));
      }
      children.add(
        TextSpan(
          text: 'inscrito ${formatTeamRegistrationDate(registeredAt!)}',
          style: _mutedStyle(muted),
        ),
      );
    }

    if (rankingPoints > 0) {
      if (children.isNotEmpty) {
        children.add(TextSpan(text: ' · ', style: _mutedStyle(muted)));
      }
      children.add(
        TextSpan(
          text: '$rankingPoints pts',
          style: _mutedStyle(muted),
        ),
      );
    }

    if (children.isEmpty) return const SizedBox.shrink();

    return Text.rich(
      TextSpan(children: children),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }

  TextStyle _mutedStyle(Color color) => AppTypography.soraRegular(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: color,
      );
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.enabled = true,
    this.iconColor,
    this.iconBackground,
    this.titleColor,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;
  final Color? iconColor;
  final Color? iconBackground;
  final Color? titleColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final fg = iconColor ?? context.themeColors.onSurface;
    final bg = iconBackground ??
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.1);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 20, color: fg),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: titleColor ?? context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 8),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final OrganizerTeamRegistrationStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg, icon) = switch (status) {
      OrganizerTeamRegistrationStatus.confirmed => (
          'Pago',
          AppColors.win.withValues(alpha: 0.18),
          AppColors.win,
          Icons.check_rounded,
        ),
      OrganizerTeamRegistrationStatus.pending => (
          'Pendente',
          AppColors.pending.withValues(alpha: 0.15),
          AppColors.pending,
          Icons.schedule_rounded,
        ),
      OrganizerTeamRegistrationStatus.waitlist => (
          'Fila',
          context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          context.themeColors.onSurfaceMuted,
          Icons.hourglass_bottom_rounded,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
