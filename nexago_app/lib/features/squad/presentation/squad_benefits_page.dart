import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_rules.dart';
import 'squad_page.dart' show SquadLoadingList, SquadNotMember;
import 'widgets/squad_sheets.dart';
import 'widgets/squad_ui.dart';

/// App 05 · Benefícios — nível, pacote do contrato e o próximo nível.
class SquadBenefitsPage extends ConsumerWidget {
  const SquadBenefitsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySquadProvider);
    return SquadScaffold(
      title: 'Benefícios',
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => const SquadLoadingList(),
        error: (e, _) => SquadMessage(
          title: 'Não foi possível carregar seus benefícios',
          message: e.toString(),
          actionLabel: 'Tentar de novo',
          onAction: () => ref.invalidate(mySquadProvider),
          icon: Icons.wifi_off_rounded,
        ),
        data: (squad) {
          final m = squad.member;
          if (m == null) return SquadNotMember(invite: squad.invite);
          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () => ref.refresh(mySquadProvider.future),
            child: _BenefitsBody(member: m),
          );
        },
      ),
    );
  }
}

class _BenefitsBody extends StatelessWidget {
  const _BenefitsBody({required this.member});

  final SquadMember member;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final m = member;
    final notice = squadContractNotice(m);
    final period = squadPeriodLabel(m.start, m.end);
    final next = m.nextPackage;
    final progress = m.progress;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 40),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        _TierCard(member: m, period: period),
        if (notice != null) ...[
          const SizedBox(height: 12),
          SquadNote(
            icon: Icons.pause_circle_outline_rounded,
            child: Text(notice),
          ),
        ],
        if (m.pendingAmendment != null) ...[
          const SizedBox(height: 12),
          SquadAmendmentCard(amendment: m.pendingAmendment!),
        ],
        const SizedBox(height: 8),
        SquadBenefitList(
          benefits: squadBenefits(
            m.package,
            periodEnd: m.end == null ? null : squadDayMonth(m.end!),
          ),
          status: m.paused ? 'Pausado' : 'Ativo',
        ),
        if (next != null && progress != null) ...[
          const SquadSection('Próximo nível'),
          SquadCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 16,
                      color: SquadStyle.dim(colors),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        next.tier.label,
                        style: SquadStyle.display(
                          15,
                          color: colors.onSurface,
                          weight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      '${progress.conversions}/${progress.minConversions}',
                      style: SquadStyle.mono(12, color: colors.onSurface),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SquadProgressBar(fraction: progress.fraction, height: 7),
                const SizedBox(height: 10),
                Text(
                  squadProgressLine(progress),
                  style: AppTypography.bodyS.copyWith(
                    color: SquadStyle.mute(colors),
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final chip in squadNextTierChips(next))
                      Container(
                        height: 28,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(99),
                          border: Border.all(color: SquadStyle.line(colors)),
                        ),
                        // `widthFactor: 1`: o chip tem a largura do texto (um
                        // `alignment` no Container o esticaria na linha toda).
                        child: Align(
                          widthFactor: 1,
                          child: Text(
                            chip,
                            style: AppTypography.bodyS.copyWith(
                              color: SquadStyle.mute(colors),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        SquadNote(
          icon: Icons.description_outlined,
          child: Text.rich(
            TextSpan(
              text: 'Ao divulgar, identifique a parceria com ',
              children: [
                TextSpan(
                  text: '#publi',
                  style: TextStyle(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const TextSpan(text: '. '),
                WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: GestureDetector(
                    key: const Key('squad-contract-link'),
                    onTap: () => showSquadContractSheet(
                      context,
                      package: m.package,
                      followerDiscountFirstOnly: m.followerDiscountFirstOnly,
                      periodLabel: period.isEmpty ? null : period,
                    ),
                    child: Text(
                      'Ver contrato',
                      style: AppTypography.bodyS.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TierCard extends StatelessWidget {
  const _TierCard({required this.member, required this.period});

  final SquadMember member;
  final String period;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final athlete = member.tier == SquadTier.ath;
    final bg = athlete
        ? colors.surfaceRaised
        : SquadStyle.tierColor(member.tier, colors);
    final fg = athlete ? colors.onSurface : SquadStyle.onBrand;
    final meta = [
      if (period.isNotEmpty) period,
      if (member.points.level.isNotEmpty) member.points.level,
      '${squadThousands(member.points.total)} pts',
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SEU NÍVEL',
            style: SquadStyle.mono(10, color: fg).copyWith(letterSpacing: 1.6),
          ),
          const SizedBox(height: 4),
          Text(member.tier.label, style: SquadStyle.display(30, color: fg)),
          const SizedBox(height: 4),
          Text(
            meta,
            key: const Key('squad-tier-meta'),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              color: fg.withValues(alpha: 0.75),
            ),
          ),
        ],
      ),
    );
  }
}
