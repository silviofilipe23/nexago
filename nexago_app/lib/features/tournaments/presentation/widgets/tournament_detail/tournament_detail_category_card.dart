import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/category_level_identity.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_listing_status.dart';
import '../../../domain/tournament_registration_logic.dart';
import '../../../domain/tournament_registration_success_args.dart';

/// Card de categoria no layout do protótipo: arte da faixa com scrim,
/// identidade (nome + frase), meta empilhada (uma info por linha) e CTA
/// numa faixa própria abaixo.
///
/// Ao tocar, encolhe levemente (`pressedScale`) — o mesmo feedback dos cards
/// do hub Competir — e abre a visão da categoria. O CTA interno ganha o gesto
/// na arena e não dispara a navegação do card.
class TournamentDetailCategoryCard extends StatefulWidget {
  const TournamentDetailCategoryCard({
    super.key,
    required this.offer,
    required this.tournamentId,
    required this.tournamentName,
    required this.tournamentStatus,
    required this.onRegister,
    this.inscriptionCount,
    this.registration,
    this.isOnWaitlist = false,
    this.registrationNotYetOpen = false,
    this.hasLiveMatch = false,
  });

  /// Quanto o card encolhe enquanto está sob o dedo.
  static const double pressedScale = 0.97;

  final TournamentCategoryOffer offer;
  final String tournamentId;
  final String tournamentName;
  final TournamentListingStatus tournamentStatus;
  final VoidCallback? onRegister;

  final int? inscriptionCount;
  final UserCategoryRegistration? registration;
  final bool isOnWaitlist;

  /// `registrationOpensAt` do torneio ainda no futuro — CTA de inscrição some.
  final bool registrationNotYetOpen;

  /// Há partida em andamento nesta categoria — selo "AO VIVO".
  final bool hasLiveMatch;

  @override
  State<TournamentDetailCategoryCard> createState() =>
      _TournamentDetailCategoryCardState();
}

class _TournamentDetailCategoryCardState
    extends State<TournamentDetailCategoryCard> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  void _openRegistrationSuccess(BuildContext context) {
    final regId = widget.registration?.registrationId.trim() ?? '';
    if (regId.isEmpty || widget.tournamentId.isEmpty) return;
    context.pushNamed(
      AppRouteNames.tournamentRegistrationSuccess,
      pathParameters: {'tournamentId': widget.tournamentId},
      extra: TournamentRegistrationSuccessArgs(
        tournamentId: widget.tournamentId,
        registrationId: regId,
        tournamentName: widget.tournamentName,
        categoryName: widget.offer.name,
      ),
      queryParameters: {
        'registrationId': regId,
        'tournamentName': widget.tournamentName,
        'categoryName': widget.offer.name,
      },
    );
  }

  void _openCategoryView(BuildContext context) {
    if (widget.tournamentId.isEmpty || widget.offer.id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.tournamentCategoryView,
      pathParameters: {
        'tournamentId': widget.tournamentId,
        'categoryId': widget.offer.id,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    final isRegistrationPaid = widget.registration?.isPaid == true;
    final isEnrolled = isRegistrationPaid || widget.isOnWaitlist;
    final status = tournamentCategoryRowStatus(
      offer,
      inscriptionCount: widget.inscriptionCount,
      tournamentStatus: widget.tournamentStatus,
      hasLiveMatch: widget.hasLiveMatch,
    );
    final vacancy = tournamentCategoryVacancyUi(
      offer,
      inscriptionCount: widget.inscriptionCount,
    );
    final ctaKind = tournamentCategoryCtaKindForAthlete(
      offer: offer,
      tournamentStatus: widget.tournamentStatus,
      isRegistrationPaid: isRegistrationPaid,
      inscriptionCount: widget.inscriptionCount,
      registrationNotYetOpen: widget.registrationNotYetOpen,
    );
    final family = categoryLevelFamily(offer);
    final accent = categoryLevelAccent(family);
    final prizesTotal = tournamentCategoryPrizesTotal(offer);
    final isTournamentOver = isTournamentTerminal(widget.tournamentStatus);
    // A arte de fundo é da FAIXA DE NÍVEL, não do torneio: é ela que o card
    // está anunciando, e cada arte nasce com os dois terços da esquerda
    // escuros, onde o texto é desenhado. Sendo asset local, está sempre lá.
    final art = categoryLevelArt(family);
    // Sobre a arte o scrim é escuro: o texto precisa ficar claro em qualquer
    // tema — `onSurface` escureceria no tema claro e sumiria na foto.
    const onCard = Colors.white;
    final onCardMuted = Colors.white.withValues(alpha: 0.72);

    final showCta = ctaKind != TournamentCategoryCtaKind.disabled;
    final cta = showCta
        ? _CategoryCtaButton(
            kind: ctaKind,
            lightOnDark: true,
            onPressed: switch (ctaKind) {
              TournamentCategoryCtaKind.register => widget.onRegister,
              TournamentCategoryCtaKind.waitlist => widget.onRegister,
              TournamentCategoryCtaKind.viewRegistration => () =>
                  _openRegistrationSuccess(context),
              TournamentCategoryCtaKind.viewCategory => () =>
                  _openCategoryView(context),
              TournamentCategoryCtaKind.disabled => null,
            },
          )
        : null;

    return AnimatedScale(
      scale: _pressed ? TournamentDetailCategoryCard.pressedScale : 1,
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: () => _openCategoryView(context),
        child: Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.md),
          constraints: const BoxConstraints(minHeight: 200),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.lg),
            // Sempre há arte sob o conteúdo, então a borda é um fio claro por
            // cima dela — a borda tingida pelo nível brigaria com a foto.
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.lg),
            child: Stack(
              children: [
                Positioned.fill(
                  child: _CardBackdrop(art: art, accent: accent),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.xl,
                    AppSpacing.xl,
                    AppSpacing.xl,
                    AppSpacing.lg,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _CategoryHeadline(
                        offer: offer,
                        family: family,
                        isEnrolled: isEnrolled,
                        isOnWaitlist: widget.isOnWaitlist,
                        status: status,
                        titleColor: onCard,
                        subtitleColor: onCardMuted,
                        chevronColor: onCardMuted,
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      // Uma info por linha — vagas, formato, taxa e premiação
                      // empilhados pra não competirem na mesma faixa.
                      _CategoryMetaColumn(
                        vacancy: vacancy,
                        levelLabel: categoryLevelFamilyLabel(family),
                        genderLabel: categoryGenderDisplayLabel(offer),
                        formatLabel: tournamentCategoryShortFormatTag(offer),
                        feeLabel: formatCategoryEntryFee(offer),
                        prizesLabel:
                            prizesTotal > 0 ? formatBRL(prizesTotal) : null,
                        showSpots: !isTournamentOver,
                        showFee: !isTournamentOver,
                        showPrizes: prizesTotal > 0,
                        valueColor: onCard,
                        mutedColor: onCardMuted,
                      ),
                      if (cta != null) ...[
                        const SizedBox(height: AppSpacing.xl),
                        Align(
                          alignment: Alignment.centerRight,
                          child: cta,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CardBackdrop extends StatelessWidget {
  const _CardBackdrop({required this.art, required this.accent});

  final String art;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          art,
          fit: BoxFit.cover,
          // As artes são bem mais largas que o card, então `cover` corta a
          // largura. Ancorar à direita preserva o terço onde mora o assunto —
          // centralizado, ele é justamente o pedaço que se perde.
          alignment: Alignment.centerRight,
          // Decorativa: quem carrega o significado é o nome da categoria.
          excludeFromSemantics: true,
          // Arte ausente não pode deixar o card ilegível: o texto é branco
          // fixo, então o fallback precisa ser escuro, nunca a superfície.
          errorBuilder: (context, error, stackTrace) =>
              _SolidFallback(accent: accent),
        ),
        // Scrim: mantém a arte visível sem matar a leitura do texto. Mais
        // pesado à esquerda, que é onde o nome e a linha de meta vivem.
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                Colors.black.withValues(alpha: 0.78),
                Colors.black.withValues(alpha: 0.6),
                Colors.black.withValues(alpha: 0.42),
              ],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.18),
          ),
        ),
      ],
    );
  }
}

class _SolidFallback extends StatelessWidget {
  const _SolidFallback({required this.accent});

  final Color accent;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(accent.withValues(alpha: 0.35), AppColors.canvas),
            AppColors.canvas,
          ],
        ),
      ),
    );
  }
}

class _CategoryHeadline extends StatelessWidget {
  const _CategoryHeadline({
    required this.offer,
    required this.family,
    required this.isEnrolled,
    required this.isOnWaitlist,
    required this.status,
    required this.titleColor,
    required this.subtitleColor,
    required this.chevronColor,
  });

  final TournamentCategoryOffer offer;
  final CategoryLevelFamily family;
  final bool isEnrolled;
  final bool isOnWaitlist;
  final TournamentCategoryRowStatus status;
  final Color titleColor;
  final Color subtitleColor;
  final Color chevronColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                offer.name,
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: titleColor,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                categoryLevelTagline(family),
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: subtitleColor,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        if (status.isLive)
          _StatePill(label: status.label, color: status.color)
        else if (isEnrolled)
          _StatePill(
            label: isOnWaitlist ? 'NA FILA' : 'INSCRITO',
            color: isOnWaitlist ? AppColors.pending : AppColors.win,
          )
        else if (status.isClosed)
          _StatePill(label: status.label, color: status.color)
        else
          Icon(Icons.chevron_right_rounded, size: 22, color: chevronColor),
      ],
    );
  }
}

class _StatePill extends StatelessWidget {
  const _StatePill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(AppRadii.sm),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _CategoryMetaColumn extends StatelessWidget {
  const _CategoryMetaColumn({
    required this.vacancy,
    required this.levelLabel,
    required this.genderLabel,
    required this.formatLabel,
    required this.feeLabel,
    required this.prizesLabel,
    required this.showSpots,
    required this.showFee,
    required this.showPrizes,
    required this.valueColor,
    required this.mutedColor,
  });

  final TournamentCategoryVacancyUi vacancy;
  final String levelLabel;
  final String genderLabel;
  final String formatLabel;
  final String feeLabel;
  final String? prizesLabel;
  final bool showSpots;
  final bool showFee;
  final bool showPrizes;
  final Color valueColor;
  final Color mutedColor;

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[
      _MetaItem(
        icon: Icons.stairs_outlined,
        value: levelLabel,
        caption: 'nível',
        valueColor: valueColor,
        mutedColor: mutedColor,
      ),
      if (genderLabel.isNotEmpty)
        _MetaItem(
          icon: Icons.wc_outlined,
          value: genderLabel,
          caption: 'gênero',
          valueColor: valueColor,
          mutedColor: mutedColor,
        ),
      if (showSpots)
        _MetaItem(
          icon: Icons.person_outline_rounded,
          value:
              vacancy.total > 0 ? '${vacancy.enrolled}/${vacancy.total}' : '—',
          caption: 'equipes',
          valueColor: valueColor,
          mutedColor: mutedColor,
        ),
      _MetaItem(
        icon: Icons.local_offer_outlined,
        value: formatLabel,
        valueColor: valueColor,
        mutedColor: mutedColor,
      ),
      if (showFee)
        _MetaItem(
          icon: Icons.account_balance_wallet_outlined,
          value: feeLabel,
          caption: 'por equipe',
          valueColor: valueColor,
          mutedColor: mutedColor,
        ),
      if (showPrizes && prizesLabel != null)
        _MetaItem(
          icon: Icons.emoji_events_outlined,
          value: prizesLabel!,
          caption: 'em prêmios',
          valueColor: valueColor,
          mutedColor: mutedColor,
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          items[i],
        ],
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  const _MetaItem({
    required this.icon,
    required this.value,
    required this.valueColor,
    required this.mutedColor,
    this.caption,
  });

  final IconData icon;
  final String value;
  final String? caption;
  final Color valueColor;
  final Color mutedColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: mutedColor),
        const SizedBox(width: AppSpacing.sm),
        Flexible(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: valueColor,
              height: 1.25,
            ),
          ),
        ),
        if (caption != null) ...[
          const SizedBox(width: AppSpacing.sm),
          Text(
            caption!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: mutedColor,
              height: 1.25,
            ),
          ),
        ],
      ],
    );
  }
}

class _CategoryCtaButton extends StatelessWidget {
  const _CategoryCtaButton({
    required this.kind,
    required this.lightOnDark,
    this.onPressed,
  });

  final TournamentCategoryCtaKind kind;
  final bool lightOnDark;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final label = tournamentCategoryCtaLabel(kind);
    final isPrimary = kind == TournamentCategoryCtaKind.register ||
        kind == TournamentCategoryCtaKind.viewRegistration ||
        (kind == TournamentCategoryCtaKind.waitlist && onPressed != null);

    if (isPrimary) {
      final isEnrolled = kind == TournamentCategoryCtaKind.viewRegistration;
      return FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: isEnrolled ? AppColors.win : AppColors.brand,
          foregroundColor: AppColors.black,
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.pillAll),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
    }

    final enabled = onPressed != null;
    final foreground = lightOnDark
        ? (enabled ? Colors.white : Colors.white54)
        : (enabled
            ? context.themeColors.onSurface
            : context.themeColors.onSurfaceMuted);
    final border = lightOnDark
        ? Colors.white.withValues(alpha: enabled ? 0.45 : 0.2)
        : context.themeColors.onSurfaceMuted.withValues(
            alpha: enabled ? 0.35 : 0.2,
          );

    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: foreground,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        side: BorderSide(color: border),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.pillAll),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: foreground,
        ),
      ),
    );
  }
}
