import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentFinancialTab extends StatelessWidget {
  const OrganizerTournamentFinancialTab({
    super.key,
    required this.summary,
    required this.categories,
  });

  final OrganizerTournamentSummary summary;
  final List<OrganizerTournamentCategorySummary> categories;

  @override
  Widget build(BuildContext context) {
    final breakdown = summary.paymentsBreakdown;
    final feeCents = breakdown.viaAppCents - breakdown.netTransferCents;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 100),
      children: [
        _TotalCollectedHeroCard(
          totalCents: breakdown.totalCollectedCents,
          paidCount: summary.enrolledCount,
          pendingCount: summary.pendingCount,
          feeCents: feeCents,
        ),
        if (breakdown.viaOrganizerCents > 0) ...[
          const SizedBox(height: 12),
          _DirectPaymentCard(amountCents: breakdown.viaOrganizerCents),
        ],
        if (breakdown.viaAppCents > 0) ...[
          const SizedBox(height: 12),
          _AppPaymentCard(
            amountCents: breakdown.viaAppCents,
            netTransferCents: breakdown.netTransferCents,
          ),
        ],
        const SizedBox(height: 24),
        _CategorySectionHeader(count: categories.length),
        const SizedBox(height: 10),
        ...categories.map(
          (category) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _CategoryFinancialCard(category: category),
          ),
        ),
      ],
    );
  }
}

class _TotalCollectedHeroCard extends StatelessWidget {
  const _TotalCollectedHeroCard({
    required this.totalCents,
    required this.paidCount,
    required this.pendingCount,
    required this.feeCents,
  });

  final int totalCents;
  final int paidCount;
  final int pendingCount;
  final int feeCents;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.18)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            Positioned(
              right: -48,
              top: -48,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.brand.withValues(alpha: 0.2),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'TOTAL ARRECADADO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    formatOrganizerMoneyDetail(totalCents),
                    style: AppTypography.soraRegular(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                      height: 1,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      Expanded(
                        child: _HeroStat(
                          label: 'Pagas',
                          value: '$paidCount',
                          valueColor: AppColors.win,
                        ),
                      ),
                      _HeroDivider(color: context.themeColors.onSurfaceMuted),
                      Expanded(
                        child: _HeroStat(
                          label: 'Pendentes',
                          value: '$pendingCount',
                          valueColor: AppColors.pending,
                        ),
                      ),
                      _HeroDivider(color: context.themeColors.onSurfaceMuted),
                      Expanded(
                        child: _HeroStat(
                          label: 'Taxa nexaGO',
                          value: formatOrganizerMoneyDetail(feeCents),
                          valueColor: AppColors.win,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroDivider extends StatelessWidget {
  const _HeroDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 36,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      color: color.withValues(alpha: 0.15),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Column(
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: muted,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: valueColor,
            height: 1.1,
          ),
        ),
      ],
    );
  }
}

class _DirectPaymentCard extends StatelessWidget {
  const _DirectPaymentCard({required this.amountCents});

  final int amountCents;

  @override
  Widget build(BuildContext context) {
    return _PaymentChannelCard(
      accent: AppColors.win,
      icon: Icons.payments_outlined,
      title: 'Direto com você',
      badgeLabel: 'SEM TAXA',
      amountCents: amountCents,
      subtitle: 'Recebido fora do app · sem taxa NexaGO',
    );
  }
}

class _AppPaymentCard extends StatelessWidget {
  const _AppPaymentCard({
    required this.amountCents,
    required this.netTransferCents,
  });

  final int amountCents;
  final int netTransferCents;

  @override
  Widget build(BuildContext context) {
    return _PaymentChannelCard(
      accent: AppColors.brand,
      icon: Icons.smartphone_outlined,
      title: 'Pelo app',
      badgeLabel: '6% TAXA',
      amountCents: amountCents,
      subtitle:
          'Repasse líquido ${formatOrganizerMoneyDetail(netTransferCents)}',
    );
  }
}

class _PaymentChannelCard extends StatelessWidget {
  const _PaymentChannelCard({
    required this.accent,
    required this.icon,
    required this.title,
    required this.badgeLabel,
    required this.amountCents,
    required this.subtitle,
  });

  final Color accent;
  final IconData icon;
  final String title;
  final String badgeLabel;
  final int amountCents;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(
                          color: accent.withValues(alpha: 0.35),
                        ),
                      ),
                      child: Text(
                        badgeLabel,
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: accent,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  formatOrganizerMoneyDetail(amountCents),
                  style: AppTypography.soraRegular(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: muted,
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

class _CategorySectionHeader extends StatelessWidget {
  const _CategorySectionHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final label = count == 1 ? '1 categoria' : '$count categorias';
    return Row(
      children: [
        Text(
          'POR CATEGORIA',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: muted,
            letterSpacing: 0.7,
          ),
        ),
        const Spacer(),
        Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: muted,
          ),
        ),
      ],
    );
  }
}

class _CategoryFinancialCard extends StatelessWidget {
  const _CategoryFinancialCard({required this.category});

  final OrganizerTournamentCategorySummary category;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final totalTeams = category.paidCount + category.pendingCount;
    final paidPct = totalTeams > 0
        ? ((category.paidCount / totalTeams) * 100).round()
        : 0;
    final progress = totalTeams > 0 ? category.paidCount / totalTeams : 0.0;
    final pendingColor = category.pendingCount > 0
        ? AppColors.pending
        : muted.withValues(alpha: 0.5);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  category.name,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1.2,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                formatOrganizerMoneyDetail(category.collectedCents),
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _CategoryStatusDot(
                color: AppColors.win,
                label: '${category.paidCount} pagas',
                textColor: AppColors.win,
              ),
              const SizedBox(width: 12),
              _CategoryStatusDot(
                color: pendingColor,
                label: '${category.pendingCount} pend.',
                textColor: pendingColor,
              ),
              const Spacer(),
              Text(
                '$paidPct% pago',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: muted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              minHeight: 5,
              backgroundColor: muted.withValues(alpha: 0.12),
              color: AppColors.win,
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryStatusDot extends StatelessWidget {
  const _CategoryStatusDot({
    required this.color,
    required this.label,
    required this.textColor,
  });

  final Color color;
  final String label;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: textColor,
          ),
        ),
      ],
    );
  }
}
