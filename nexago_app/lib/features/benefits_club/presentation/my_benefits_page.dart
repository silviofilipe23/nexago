import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_borders.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_premium_logic.dart';
import '../domain/my_benefits.dart';
import '../domain/partner.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/benefits_skeleton.dart';
import 'widgets/partner_visuals.dart';

enum _Tab { used, saved }

/// "Meus benefícios": abas Usados (do `getMyBenefits`, com a resposta do
/// "Conseguiu usar?") e Salvos (coração), e a economia confirmada pelos
/// parceiros — que some sem resgate confirmado. Parceiro aberto daqui grava a
/// origem `my_benefits`.
class MyBenefitsPage extends ConsumerStatefulWidget {
  const MyBenefitsPage({super.key});

  @override
  ConsumerState<MyBenefitsPage> createState() => _MyBenefitsPageState();
}

class _MyBenefitsPageState extends ConsumerState<MyBenefitsPage> {
  _Tab _tab = _Tab.used;

  void _back() =>
      benefitsBack(context, benefitsClubLocation(BenefitSource.myBenefits));

  void _openClub() =>
      benefitsBack(context, benefitsClubLocation(BenefitSource.myBenefits));

  void _openPartner(Partner partner) =>
      openBenefitsPartner(context, partner.id, BenefitSource.myBenefits);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: 'Meus benefícios',
              subtitle: 'Clube de Vantagens',
              onBack: _back,
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    final partnersAsync = ref.watch(benefitsVisiblePartnersProvider);
    final mineAsync = ref.watch(benefitsMyBenefitsProvider);
    final partners = partnersAsync.valueOrNull;
    final mine = mineAsync.valueOrNull;
    final error = partnersAsync.error ?? mineAsync.error;
    if (partners == null || mine == null) {
      if (error == null) return const BenefitsClubSkeleton();
      return AppErrorView(
        title: 'Não deu para abrir seus benefícios',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar seus benefícios',
          logReason: 'clube:meus',
        ),
        onRetry: () {
          ref.invalidate(benefitsActivePartnersProvider);
          ref.invalidate(benefitsMyBenefitsProvider);
        },
      );
    }
    final byId = {for (final p in partners) p.id: p};
    final uses = visibleUses(mine.uses, byId.keys.toSet());
    final savedIds = ref.watch(benefitsSavedIdsProvider).valueOrNull ?? {};
    final saved = partners.where((p) => savedIds.contains(p.id)).toList();

    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xs,
        AppSpacing.screenH,
        MediaQuery.paddingOf(context).bottom + AppSpacing.xxxl,
      ),
      children: [
        _Tabs(
          tab: _tab,
          usedCount: uses.length,
          savedCount: saved.length,
          onTab: (tab) => setState(() => _tab = tab),
        ),
        const SizedBox(height: AppSpacing.md),
        if (mine.savings.hasConfirmed) ...[
          _SavingsCard(savings: mine.savings),
          const SizedBox(height: AppSpacing.md),
        ],
        if (_tab == _Tab.used)
          ..._usedList(uses, byId)
        else
          ..._savedList(saved),
      ],
    );
  }

  List<Widget> _usedList(List<BenefitUse> uses, Map<String, Partner> byId) {
    if (uses.isEmpty) {
      return [
        _EmptyState(
          icon: Icons.confirmation_number_outlined,
          title: 'Nenhum benefício usado ainda',
          text:
              'Quando você usar um desconto do clube, ele aparece aqui com a '
              'sua resposta.',
          onAction: _openClub,
        ),
      ];
    }
    return [
      const BenefitsEyebrow('Usados'),
      const SizedBox(height: 10),
      for (final use in uses)
        if (byId[use.partnerId] case final partner?) ...[
          _BenefitRow(
            key: Key('benefits-used-${partner.id}'),
            partner: partner,
            meta: benefitUseLabel(
              use,
              isLead: partner.ctaType == PartnerCtaType.leadForm,
            ),
            status: _StatusPill(answer: use.lastAnswer),
            onTap: () => _openPartner(partner),
          ),
          const SizedBox(height: 10),
        ],
    ];
  }

  List<Widget> _savedList(List<Partner> saved) {
    if (saved.isEmpty) {
      return [
        _EmptyState(
          icon: Icons.favorite_border_rounded,
          title: 'Nada salvo ainda',
          text:
              'Toque no coração de um parceiro para guardar aqui. A gente '
              'avisa antes da oferta acabar.',
          onAction: _openClub,
        ),
      ];
    }
    final now = ref.watch(benefitsClockProvider)();
    return [
      const BenefitsEyebrow('Salvos'),
      const SizedBox(height: 10),
      for (final partner in saved) ...[
        _BenefitRow(
          key: Key('benefits-saved-${partner.id}'),
          partner: partner,
          meta: endingBadge(partner, now) ?? partner.benefitTitle,
          status: partner.benefitHighlight.isEmpty
              ? null
              : BenefitHighlightBadge(partner.benefitHighlight),
          onTap: () => _openPartner(partner),
        ),
        const SizedBox(height: 10),
      ],
    ];
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.tab,
    required this.usedCount,
    required this.savedCount,
    required this.onTab,
  });

  final _Tab tab;
  final int usedCount;
  final int savedCount;
  final ValueChanged<_Tab> onTab;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget option(_Tab value, String label, int count) {
      final on = tab == value;
      return Expanded(
        child: Semantics(
          selected: on,
          button: true,
          child: InkWell(
            key: Key('benefits-tab-${value.name}'),
            borderRadius: AppRadii.mdAll,
            onTap: () => onTab(value),
            child: Container(
              height: 40,
              decoration: BoxDecoration(
                color: on ? colors.surfaceSheet : Colors.transparent,
                borderRadius: AppRadii.mdAll,
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: AppTypography.labelL.copyWith(
                      fontSize: 13.5,
                      color: on ? colors.onSurface : colors.onSurfaceMuted,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$count',
                    style: AppTypography.mono(
                      fontSize: benefitsMinFontSize,
                      fontWeight: FontWeight.w700,
                      color: colors.brandText,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Row(
        children: [
          option(_Tab.used, 'Usados', usedCount),
          option(_Tab.saved, 'Salvos', savedCount),
        ],
      ),
    );
  }
}

class _SavingsCard extends StatelessWidget {
  const _SavingsCard({required this.savings});

  static const Key cardKey = Key('benefits-mine-savings');

  final BenefitSavings savings;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      key: cardKey,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: AppColors.win.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              AppColors.win.withValues(alpha: 0.12),
              colors.surfaceCard,
            ),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BenefitsEyebrow('Economia confirmada', color: colors.win),
          const SizedBox(height: 6),
          Text(
            formatBRLFromCents(savings.totalDiscountCents),
            style: AppTypography.soraRegular(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: colors.win,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            savingsCountLabel(savings.confirmedCount),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 10),
          Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.08)),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Icon(
                Icons.verified_outlined,
                size: 14,
                color: colors.onSurfaceMuted,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'Valores confirmados pelos parceiros.',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BenefitRow extends StatelessWidget {
  const _BenefitRow({
    super.key,
    required this.partner,
    required this.meta,
    required this.onTap,
    this.status,
  });

  final Partner partner;
  final String meta;
  final VoidCallback onTap;
  final Widget? status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final status = this.status;
    return Material(
      color: colors.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: AppBorders.subtleSide(colors),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              PartnerLogo(
                partner: partner,
                size: 46,
                borderRadius: AppRadii.mdAll,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      partner.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.titleS.copyWith(
                        fontSize: 14.5,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      meta,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (status != null) ...[
                const SizedBox(width: AppSpacing.sm),
                status,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.answer});

  final BenefitUseAnswer? answer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ok = answer == BenefitUseAnswer.used;
    final tone = ok ? colors.win : colors.onSurfaceMuted;
    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: ok ? 0.10 : 0.06),
        borderRadius: AppRadii.smAll,
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (ok) ...[
            Icon(Icons.check_rounded, size: 12, color: tone),
            const SizedBox(width: 4),
          ],
          Text(
            benefitAnswerLabel(answer),
            style: AppTypography.bodyS.copyWith(
              fontSize: benefitsMinFontSize,
              fontWeight: FontWeight.w700,
              color: tone,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.text,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String text;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.16)),
      ),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 22, color: colors.brandText),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            text,
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          OutlinedButton(
            key: const Key('benefits-mine-see-partners'),
            onPressed: onAction,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, benefitsTapTarget),
              side: AppBorders.strongSide(colors),
              shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
            ),
            child: Text(
              'Ver parceiros',
              style: AppTypography.labelL.copyWith(color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}
