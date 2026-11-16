import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_icon_square_button.dart';
import '../../domain/partner.dart';
import 'partner_cover.dart';
import 'benefits_club_parts.dart';
import 'partner_visuals.dart';

/// Altura da capa do topo da tela do parceiro (sem a barra de status).
const double _heroCoverHeight = 170;
const double _heroLogoSize = 72;

/// Topo da tela do parceiro: a capa (ou a cor da marca) passa por baixo da
/// barra de status, com voltar, salvar (coração), o selo de prazo ou de
/// exclusividade e a logo saindo da capa.
class BenefitPartnerHero extends StatelessWidget {
  const BenefitPartnerHero({
    super.key,
    required this.partner,
    required this.onBack,
    this.saved,
    this.onToggleSaved,
    this.badge,
    this.badgeIcon = Icons.schedule_rounded,
    this.locked = false,
  });

  final Partner partner;
  final VoidCallback onBack;

  /// `null` = o coração some (salvos ainda carregando ou deslogado).
  final bool? saved;
  final VoidCallback? onToggleSaved;

  /// "Termina em 3 dias" ou "Exclusivo Squad".
  final String? badge;
  final IconData badgeIcon;
  final bool locked;

  /// O que fica atrás da barra de status é escuro (decide a cor dos ícones).
  /// Bloqueado sem capa usa a superfície do tema, não a marca.
  static bool isDark(
    Partner partner, {
    required bool locked,
    required bool themeIsDark,
  }) {
    if (partner.coverUrl != null) return true;
    if (locked) return themeIsDark;
    return onPartnerBrand(partnerBrandColor(partner)) == AppColors.white;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final brand = partnerBrandColor(partner);
    final hasCover = partner.coverUrl != null;
    final ink = hasCover
        ? AppColors.white
        : locked
        ? colors.onSurface
        : onPartnerBrand(brand);
    final top = MediaQuery.paddingOf(context).top;
    final saved = this.saved;
    final onToggleSaved = this.onToggleSaved;
    final badge = this.badge;
    return SizedBox(
      height: top + _heroCoverHeight + _heroLogoSize / 2,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: top + _heroCoverHeight,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (hasCover)
                  PartnerCover(partner: partner, muted: locked)
                else
                  ColoredBox(color: locked ? colors.surfaceRaised : brand),
                if (hasCover)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          AppColors.black.withValues(alpha: 0.35),
                          AppColors.black.withValues(alpha: 0),
                          AppColors.black.withValues(alpha: 0.55),
                        ],
                        stops: const [0, 0.4, 1],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Positioned(
            left: AppSpacing.screenH,
            right: AppSpacing.screenH,
            top: top + AppSpacing.sm,
            child: Row(
              children: [
                _GlassButton(
                  icon: Icons.arrow_back_rounded,
                  tooltip: 'Voltar',
                  ink: ink,
                  onTap: onBack,
                ),
                const Spacer(),
                if (partner.isMasterSponsor) ...[
                  _OfficialPill(ink: ink),
                  const SizedBox(width: AppSpacing.sm),
                ],
                if (saved != null && onToggleSaved != null)
                  _GlassButton(
                    key: const Key('benefits-save'),
                    icon: saved
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    tooltip: saved
                        ? 'Remover ${partner.name} dos salvos'
                        : 'Salvar ${partner.name}',
                    ink: saved ? AppColors.brand : ink,
                    selected: saved,
                    onTap: onToggleSaved,
                  ),
              ],
            ),
          ),
          if (badge != null)
            Positioned(
              right: AppSpacing.screenH,
              top: top + _heroCoverHeight - 40,
              child: CoverTag(
                label: badge,
                tone: CoverTagTone.warning,
                icon: badgeIcon,
                height: 26,
              ),
            ),
          Positioned(
            left: AppSpacing.screenH,
            bottom: 0,
            child: Hero(
              tag: partnerLogoHeroTag(partner.id),
              child: PartnerLogo(
                partner: partner,
                size: _heroLogoSize,
                borderRadius: AppRadii.xlAll,
                ring: BorderSide(color: colors.canvas, width: 4),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.ink,
    required this.onTap,
    this.selected,
  });

  final IconData icon;
  final String tooltip;
  final Color ink;
  final VoidCallback onTap;
  final bool? selected;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: NexaIconSquareButton(
      icon: icon,
      size: benefitsTapTarget,
      tooltip: tooltip,
      iconColor: ink,
      background: AppColors.black.withValues(alpha: 0.35),
      side: BorderSide(color: AppColors.white.withValues(alpha: 0.22)),
      onTap: onTap,
    ),
  );
}

class _OfficialPill extends StatelessWidget {
  const _OfficialPill({required this.ink});

  final Color ink;

  @override
  Widget build(BuildContext context) => Container(
    height: 28,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: BoxDecoration(
      color: AppColors.black.withValues(alpha: 0.35),
      borderRadius: AppRadii.pillAll,
      border: Border.all(color: ink.withValues(alpha: 0.3)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_outline_rounded, size: 13, color: ink),
        const SizedBox(width: 6),
        BenefitsEyebrow('Patrocinador oficial', color: ink),
      ],
    ),
  );
}

/// Nome e "Categoria · cidade", ao lado da logo que sai da capa.
class BenefitPartnerIdentity extends StatelessWidget {
  const BenefitPartnerIdentity({
    super.key,
    required this.partner,
    required this.locationLabel,
  });

  final Partner partner;
  final String locationLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(left: _heroLogoSize + AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              partner.name,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          const SizedBox(height: 3),
          BenefitsEyebrow(locationLabel),
        ],
      ),
    );
  }
}

/// O benefício em destaque: selo grande em verde, título e descrição.
class BenefitDetailsCard extends StatelessWidget {
  const BenefitDetailsCard({super.key, required this.partner});

  final Partner partner;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (partner.benefitHighlight.isNotEmpty) ...[
            Text(
              partner.benefitHighlight,
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: colors.win,
                height: 1.1,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Text(
            partner.benefitTitle,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          if (partner.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              partner.description,
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Os passos numerados, com o botão, o cupom e o WhatsApp em negrito.
class BenefitSteps extends StatelessWidget {
  const BenefitSteps({super.key, required this.steps, required this.bold});

  final List<String> steps;
  final List<String> bold;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = AppTypography.bodyS.copyWith(
      fontSize: 13,
      height: 1.45,
      color: colors.onSurface.withValues(alpha: 0.8),
    );
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == steps.length - 1 ? 0 : 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    shape: BoxShape.circle,
                    border: AppBorders.strong(colors),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.mono(
                      fontSize: 12,
                      color: colors.brandText,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text.rich(
                      boldSpans(
                        steps[i],
                        bold: bold,
                        style: style,
                        boldStyle: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// "Termos e condições" que abre e fecha no lugar.
class BenefitTermsSection extends StatefulWidget {
  const BenefitTermsSection({super.key, required this.terms});

  final String terms;

  @override
  State<BenefitTermsSection> createState() => _BenefitTermsSectionState();
}

class _BenefitTermsSectionState extends State<BenefitTermsSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          expanded: _open,
          child: InkWell(
            key: const Key('benefits-terms-toggle'),
            onTap: () => setState(() => _open = !_open),
            child: Container(
              constraints: const BoxConstraints(minHeight: benefitsTapTarget),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              decoration: BoxDecoration(
                border: Border(top: AppBorders.subtleSide(colors)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Termos e condições',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _open ? 0.25 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xs,
              AppSpacing.xs,
              AppSpacing.xs,
              AppSpacing.sm,
            ),
            child: Text(
              widget.terms,
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.5,
              ),
            ),
          ),
      ],
    );
  }
}

/// Barra fixa do pé com o botão laranja e a dica embaixo.
class BenefitCtaBar extends StatelessWidget {
  const BenefitCtaBar({
    super.key,
    required this.label,
    required this.hint,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.buttonKey,
    this.secondary = false,
  });

  /// `null` = só a dica (parceiro bloqueado sem destino, como o de nível).
  final String? label;
  final String? hint;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final Key? buttonKey;

  /// Botão contornado em laranja ("Conhecer o Squad"), não o de resgate.
  final bool secondary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hint = this.hint;
    final icon = this.icon;
    final label = this.label;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: AppBorders.subtleSide(colors)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.md,
            AppSpacing.screenH,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (label != null)
                SizedBox(
                  height: 52,
                  child: secondary
                      ? OutlinedButton(
                          key: buttonKey,
                          onPressed: onPressed,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: colors.brandText,
                            backgroundColor: colors.surfaceRaised,
                            side: BorderSide(
                              color: AppColors.brand.withValues(alpha: 0.55),
                              width: 1.5,
                            ),
                            shape: const RoundedRectangleBorder(
                              borderRadius: AppRadii.mdAll,
                            ),
                          ),
                          child: _label(label, icon),
                        )
                      : FilledButton(
                          key: buttonKey,
                          onPressed: busy ? null : onPressed,
                          style: FilledButton.styleFrom(
                            shape: const RoundedRectangleBorder(
                              borderRadius: AppRadii.mdAll,
                            ),
                          ),
                          child: busy
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.4,
                                    color: AppColors.canvas,
                                  ),
                                )
                              : _label(label, icon),
                        ),
                ),
              if (hint != null) ...[
                if (label != null) const SizedBox(height: 6),
                Text(
                  hint,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: benefitsMinFontSize,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String text, IconData? icon) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Flexible(
        child: Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.labelL.copyWith(fontSize: 15),
        ),
      ),
      if (icon != null) ...[
        const SizedBox(width: AppSpacing.sm),
        Icon(icon, size: 17),
      ],
    ],
  );
}
