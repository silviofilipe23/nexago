import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/benefits_club_providers.dart';
import '../../domain/benefit_event.dart';
import '../../domain/partner.dart';
import '../benefits_club_navigation.dart';
import 'partner_visuals.dart';

/// Selo NOVO no canto superior direito dos dois cards: distância das bordas
/// e largura fixa (o texto que fica embaixo reserva esse espaço).
const double _badgeInset = AppSpacing.sm;
const double _badgeWidth = 44;
const double _badgeGap = 6;

/// Respiro interno dos cards e área da seta, para calcular quanto o texto
/// precisa recuar e não passar por baixo do selo.
const double _cardPadding = AppSpacing.md + 2;
const double _arrowArea = 17 + AppSpacing.sm;

/// Recuo à direita do título do card padrão (ele já termina antes da seta).
const double _titleBadgeClearance =
    _badgeInset + _badgeWidth + _badgeGap - _cardPadding - _arrowArea;

/// Recuo à direita da faixa "Oferecido por" (ela vai até a borda do card).
const double _stripBadgeClearance =
    _badgeInset + _badgeWidth + _badgeGap - _cardPadding;

/// Card "Clube de Vantagens Nexa" do Hub, de largura inteira, logo abaixo da
/// grade. Só aparece com a flag ligada ou para quem testa; carregando ou com
/// erro não ocupa espaço nenhum (o Hub de hoje não pode pular nem quebrar).
class BenefitsClubHubCard extends ConsumerWidget {
  const BenefitsClubHubCard({super.key, this.bottomGap = 0});

  static const Key cardKey = Key('compete-hub-benefits-club');

  /// Respiro depois do card — só existe quando o card aparece.
  final double bottomGap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(benefitsHubCardVisibleProvider)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsets.only(bottom: bottomGap),
      child: _HubCard(
        key: cardKey,
        sponsor: ref.watch(benefitsHubSponsorProvider),
      ),
    );
  }
}

class _HubCard extends ConsumerStatefulWidget {
  const _HubCard({super.key, this.sponsor});

  /// `appConfig/benefitsClub.hubSponsorPartnerId` visível para a pessoa: o
  /// card vira "Oferecido por <parceiro>", na cor da marca.
  final Partner? sponsor;

  @override
  ConsumerState<_HubCard> createState() => _HubCardState();
}

class _HubCardState extends ConsumerState<_HubCard> {
  @override
  void initState() {
    super.initState();
    // Visto = desenhado. O tracker garante uma vez por sessão do app.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(benefitsClubTrackerProvider).hubCardViewed();
    });
  }

  @override
  Widget build(BuildContext context) {
    final sponsor = widget.sponsor;
    if (sponsor != null) {
      return _SponsorHubCard(sponsor: sponsor, onTap: _open);
    }
    final colors = context.themeColors;
    final titleStyle = AppTypography.titleS.copyWith(
      fontSize: 14.5,
      color: colors.onSurface,
      height: 1.25,
    );
    return Semantics(
      button: true,
      label: 'Clube de Vantagens Nexa, novo. Descontos dos parceiros NexaGO',
      excludeSemantics: true,
      onTap: _open,
      child: Material(
        color: Color.alphaBlend(
          AppColors.brand.withValues(alpha: 0.08),
          colors.surfaceCard,
        ),
        clipBehavior: Clip.antiAlias,
        shape: const RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: AppColors.brand, width: 1.5),
        ),
        child: _WithCornerBadge(
          child: InkWell(
            onTap: _open,
            child: Padding(
              padding: const EdgeInsets.all(_cardPadding),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: const BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: AppRadii.mdAll,
                    ),
                    child: const Icon(
                      Icons.card_giftcard_rounded,
                      size: 21,
                      color: AppColors.canvas,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(
                            right: _titleBadgeClearance,
                          ),
                          child: Text(
                            'Clube de Vantagens Nexa',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: titleStyle,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Descontos dos parceiros NexaGO',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11.5,
                            height: 1.3,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Icon(
                    Icons.arrow_forward_rounded,
                    size: 17,
                    color: colors.onSurface,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _open() => openBenefitsClub(context, BenefitSource.hubCard);
}

/// Põe o selo NOVO no canto superior direito do card, por cima do conteúdo.
/// O selo não recebe toque: o card inteiro continua sendo o botão.
class _WithCornerBadge extends StatelessWidget {
  const _WithCornerBadge({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      child,
      const Positioned(
        top: _badgeInset,
        right: _badgeInset,
        child: IgnorePointer(child: _NewBadge()),
      ),
    ],
  );
}

class _NewBadge extends StatelessWidget {
  const _NewBadge();

  static const Key badgeKey = Key('benefits-hub-card-new-badge');

  @override
  Widget build(BuildContext context) => Container(
    key: badgeKey,
    width: _badgeWidth,
    height: 18,
    decoration: const BoxDecoration(
      color: AppColors.brand,
      borderRadius: AppRadii.smAll,
    ),
    alignment: Alignment.center,
    child: Text(
      'NOVO',
      style: AppTypography.mono(
        fontSize: benefitsMinFontSize,
        fontWeight: FontWeight.w800,
        color: AppColors.canvas,
        letterSpacing: 0.8,
        height: 1,
      ),
    ),
  );
}

/// Card do Hub em modo patrocinador: o mesmo card do clube (borda laranja,
/// selo NOVO no canto superior direito), com a faixa "Oferecido por <parceiro>" no topo. A cor da marca
/// fica só na faixa e no ícone; sem as logos dos parceiros, que repetiam a
/// marca do patrocinador num card pequeno.
class _SponsorHubCard extends StatelessWidget {
  const _SponsorHubCard({required this.sponsor, required this.onTap});

  static const Key sponsorKey = Key('compete-hub-benefits-sponsor');

  final Partner sponsor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final brand = partnerBrandColor(sponsor);
    final accent = partnerInkOnSurface(brand, colors.surfaceCard);
    return Semantics(
      button: true,
      label:
          'Clube de Vantagens Nexa, novo, oferecido por ${sponsor.name}. '
          'Descontos dos parceiros NexaGO',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        clipBehavior: Clip.antiAlias,
        color: Color.alphaBlend(
          AppColors.brand.withValues(alpha: 0.08),
          colors.surfaceCard,
        ),
        shape: const RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: AppColors.brand, width: 1.5),
        ),
        child: _WithCornerBadge(
          child: InkWell(
            key: sponsorKey,
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: _stripBadgeClearance),
                    child: Row(
                      children: [
                        PartnerLogo(
                          partner: sponsor,
                          size: 20,
                          borderRadius: AppRadii.smAll,
                          onBrandSurface: true,
                        ),
                        const SizedBox(width: 7),
                        Flexible(
                          child: BenefitsEyebrow(
                            'Oferecido por ${sponsor.name}',
                            color: accent,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: brand,
                          borderRadius: AppRadii.mdAll,
                        ),
                        child: Icon(
                          Icons.card_giftcard_rounded,
                          size: 21,
                          color: onPartnerBrand(brand),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Clube de Vantagens Nexa',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.titleS.copyWith(
                                fontSize: 14.5,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'Descontos dos parceiros NexaGO',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11.5,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Icon(
                        Icons.arrow_forward_rounded,
                        size: 17,
                        color: colors.onSurface,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
