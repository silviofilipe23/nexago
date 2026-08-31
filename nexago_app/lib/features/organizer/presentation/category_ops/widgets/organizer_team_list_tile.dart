import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import 'organizer_team_dual_avatars.dart';

class OrganizerTeamListTile extends StatelessWidget {
  const OrganizerTeamListTile({
    super.key,
    required this.team,
    required this.rank,
    required this.onTap,
  });

  final OrganizerCategoryTeamRow team;
  final int rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isTopRank = rank <= 3;
    final rankColor = isTopRank
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55);

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isTopRank
                      ? AppColors.brand.withValues(alpha: 0.14)
                      : context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.08,
                        ),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: rankColor.withValues(alpha: isTopRank ? 0.45 : 0.2),
                  ),
                ),
                child: Text(
                  '$rank',
                  style: AppTypography.mono(
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                    color: rankColor,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              OrganizerTeamDualAvatars(
                player1: team.player1,
                player2: team.player2,
                overlapRingColor: context.themeColors.surfaceRaised,
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
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      team.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _StatusPill(
                    status: team.status,
                    awaitsVerification: teamAwaitsPaymentVerification(team),
                  ),
                  if (teamHasPartialPayment(team)) ...[
                    const SizedBox(height: 4),
                    _PartialPaymentPill(team: team),
                  ],
                  const SizedBox(height: 4),
                  _LgpdPill(team: team),
                  if (team.hasCancellationRequest) ...[
                    const SizedBox(height: 4),
                    const _CancellationPill(),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Atleta pediu cancelamento e o organizador ainda não respondeu — a ação fica
/// no sheet de ações da linha.
class _CancellationPill extends StatelessWidget {
  const _CancellationPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.live.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event_busy_rounded, size: 11, color: AppColors.live),
          const SizedBox(width: 3),
          Text(
            'CANCELAMENTO',
            style: AppTypography.mono(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: AppColors.live,
            ),
          ),
        ],
      ),
    );
  }
}

/// Aceite do termo de uso de imagem/LGPD registrado na inscrição:
/// verde = todos os atletas, âmbar = parcial, apagado = nenhum (inclui
/// inscrições antigas, feitas antes de o termo existir no fluxo).
class _LgpdPill extends StatelessWidget {
  const _LgpdPill({required this.team});

  final OrganizerCategoryTeamRow team;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final (bg, fg, icon) = team.lgpdAcceptedByAll
        ? (
            AppColors.win.withValues(alpha: 0.18),
            AppColors.win,
            Icons.verified_user_rounded,
          )
        : team.lgpdPartiallyAccepted
            ? (
                AppColors.pending.withValues(alpha: 0.15),
                AppColors.pending,
                Icons.shield_outlined,
              )
            : (
                muted.withValues(alpha: 0.12),
                muted,
                Icons.shield_outlined,
              );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 3),
          Text(
            'LGPD',
            style: AppTypography.mono(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Dupla que pagou pela metade: a baixa é atleta a atleta, na folha de ações.
/// Sem esse selo o organizador só descobre abrindo dupla por dupla.
class _PartialPaymentPill extends StatelessWidget {
  const _PartialPaymentPill({required this.team});

  final OrganizerCategoryTeamRow team;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.pie_chart_outline_rounded, size: 11, color: AppColors.pending),
          const SizedBox(width: 3),
          Text(
            teamPartialPaymentLabel(team),
            style: AppTypography.mono(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: AppColors.pending,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status, this.awaitsVerification = false});

  final OrganizerTeamRegistrationStatus status;

  /// Vaga garantida pela declaração dos atletas, sem baixa do organizador —
  /// dizer "Pago" aqui esconderia justamente a linha que precisa de ação.
  final bool awaitsVerification;

  @override
  Widget build(BuildContext context) {
    if (awaitsVerification) {
      return _pill(
        label: 'A conferir',
        bg: AppColors.pending.withValues(alpha: 0.15),
        fg: AppColors.pending,
        icon: Icons.fact_check_outlined,
      );
    }
    final (label, bg, fg, icon) = switch (status) {
      OrganizerTeamRegistrationStatus.confirmed => (
        'Pago',
        AppColors.win.withValues(alpha: 0.18),
        AppColors.win,
        Icons.check_rounded,
      ),
      OrganizerTeamRegistrationStatus.pending => (
        '',
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

    return _pill(label: label, bg: bg, fg: fg, icon: icon);
  }

  Widget _pill({
    required String label,
    required Color bg,
    required Color fg,
    required IconData icon,
  }) {
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
