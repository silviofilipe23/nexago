import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../widgets/organizer_team_dual_avatars.dart';

class OrganizerCategoryPaymentsTab extends ConsumerStatefulWidget {
  const OrganizerCategoryPaymentsTab({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<OrganizerCategoryPaymentsTab> createState() =>
      _OrganizerCategoryPaymentsTabState();
}

class _OrganizerCategoryPaymentsTabState
    extends ConsumerState<OrganizerCategoryPaymentsTab> {
  static const _paidPreviewLimit = 5;
  bool _showAllPaid = false;

  Future<void> _chargeTeam(OrganizerCategoryTeamRow team) async {
    final service = ref.read(organizerCategoryOpsServiceProvider);
    try {
      await service.resendRegistrationPayment(
        registrationId: team.registrationId,
      );
      if (mounted) showAppSnackBar(context, 'Cobrança enviada.');
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    }
  }

  Future<void> _chargeAll(List<OrganizerCategoryTeamRow> pending) async {
    final service = ref.read(organizerCategoryOpsServiceProvider);
    for (final team in pending) {
      try {
        await service.resendRegistrationPayment(
          registrationId: team.registrationId,
        );
      } catch (_) {}
    }
    if (mounted) showAppSnackBar(context, 'Cobranças reenviadas.');
  }

  @override
  Widget build(BuildContext context) {
    final key = OrganizerCategoryKey(
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final summary = ref.watch(organizerCategoryPaymentsProvider(key));
    final teamsAsync = ref.watch(organizerCategoryVisibleTeamsProvider(key));

    return teamsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => AppInlineErrorView(error: e),
      data: (teams) {
        final pending = teams
            .where((t) => t.status == OrganizerTeamRegistrationStatus.pending)
            .toList();
        final paid = teams
            .where((t) => t.status == OrganizerTeamRegistrationStatus.confirmed)
            .toList();
        final visiblePaid = _showAllPaid
            ? paid
            : paid.take(_paidPreviewLimit).toList();

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            _CollectedSummaryCard(summary: summary),
            if (summary.viaAppCents > 0) ...[
              const SizedBox(height: 12),
              _PayoutCard(netTransferCents: summary.netTransferCents),
            ],
            if (pending.isNotEmpty) ...[
              const SizedBox(height: 20),
              _PaymentsSectionHeader(
                label: 'PENDENTES',
                count: pending.length,
                actionLabel: 'Cobrar todas',
                actionColor: AppColors.pending,
                onAction: () => _chargeAll(pending),
              ),
              const SizedBox(height: 10),
              ...pending.map(
                (team) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _PendingPaymentTile(
                    team: team,
                    onCharge: () => _chargeTeam(team),
                  ),
                ),
              ),
            ],
            if (paid.isNotEmpty) ...[
              const SizedBox(height: 20),
              _PaymentsSectionHeader(
                label: 'RECEBIDAS',
                count: paid.length,
                actionLabel: paid.length > _paidPreviewLimit && !_showAllPaid
                    ? 'Ver todas'
                    : null,
                onAction: paid.length > _paidPreviewLimit && !_showAllPaid
                    ? () => setState(() => _showAllPaid = true)
                    : null,
              ),
              const SizedBox(height: 10),
              ...visiblePaid.map(
                (team) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _ReceivedPaymentTile(team: team),
                ),
              ),
            ],
            if (teams.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 32),
                child: Center(
                  child: Text(
                    'Nenhuma inscrição nesta categoria.',
                    style: AppTypography.soraRegular(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CollectedSummaryCard extends StatelessWidget {
  const _CollectedSummaryCard({required this.summary});

  final OrganizerCategoryPaymentsSummary summary;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final progress = summary.progress.clamp(0.0, 1.0);
    final paidLabel = summary.totalSlots > 0
        ? '${summary.paidCount} de ${summary.totalSlots} pagas'
        : '${summary.paidCount} pagas';
    final breakdownLines = <String>[
      if (summary.viaAppCents > 0)
        'Pelo app · ${formatOrganizerMoneyDetail(summary.viaAppCents)}',
      if (summary.viaOrganizerCents > 0)
        'Direto com você · ${formatOrganizerMoneyDetail(summary.viaOrganizerCents)}',
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'ARRECADADO NESTA CATEGORIA',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.win,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatOrganizerMoneyDetail(summary.totalCollectedCents),
                style: AppTypography.soraRegular(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1,
                ),
              ),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      formatOrganizerMoneyDetail(summary.expectedCents),
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: muted,
                      ),
                    ),
                    Text(
                      'previsto',
                      style: AppTypography.soraRegular(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: muted.withValues(alpha: 0.8),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (breakdownLines.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...breakdownLines.map(
              (line) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  line,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: muted,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: muted.withValues(alpha: 0.15),
              color: AppColors.win,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                paidLabel,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: muted,
                ),
              ),
              const Spacer(),
              if (summary.outstandingCents > 0)
                Text(
                  '${formatOrganizerMoneyDetail(summary.outstandingCents)} em aberto',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.pending,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PayoutCard extends StatelessWidget {
  const _PayoutCard({required this.netTransferCents});

  final int netTransferCents;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.account_balance_wallet_outlined,
              size: 18,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Repasse líquido · ${formatOrganizerMoneyDetail(netTransferCents)}',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Líquido após taxa 6% · só inscrições pelo app',
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentsSectionHeader extends StatelessWidget {
  const _PaymentsSectionHeader({
    required this.label,
    required this.count,
    this.actionLabel,
    this.actionColor,
    this.onAction,
  });

  final String label;
  final int count;
  final String? actionLabel;
  final Color? actionColor;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          '$label · $count',
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.8,
          ),
        ),
        const Spacer(),
        if (actionLabel != null && onAction != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              foregroundColor: actionColor ?? AppColors.brand,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              actionLabel!,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: actionColor ?? AppColors.brand,
              ),
            ),
          ),
      ],
    );
  }
}

class _PendingPaymentTile extends StatelessWidget {
  const _PendingPaymentTile({required this.team, required this.onCharge});

  final OrganizerCategoryTeamRow team;
  final VoidCallback onCharge;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
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
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  teamPendingPaymentSubtitle(team),
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onCharge,
            style: TextButton.styleFrom(
              backgroundColor: AppColors.brand.withValues(alpha: 0.18),
              foregroundColor: AppColors.pending,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: Text(
              'Cobrar',
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: AppColors.pending,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceivedPaymentTile extends StatelessWidget {
  const _ReceivedPaymentTile({required this.team});

  final OrganizerCategoryTeamRow team;

  @override
  Widget build(BuildContext context) {
    final amount = formatOrganizerMoneyDetail(teamDisplayAmountCents(team));
    final muted = context.themeColors.onSurfaceMuted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: muted.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
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
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  teamReceivedPaymentSubtitle(team),
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: muted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppColors.win,
                ),
              ),
              Text(
                'recebido',
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: muted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
