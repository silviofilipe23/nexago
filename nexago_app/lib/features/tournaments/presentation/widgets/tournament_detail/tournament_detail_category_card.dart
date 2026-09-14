import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/category_level_identity.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_listing_status.dart';
import '../../../domain/tournament_registration_success_args.dart';

/// Card de categoria: identidade da faixa de nível (cor + ícone + frase), uma
/// linha de meta com vagas/formato/taxa e a ação. O detalhe (grade de vagas,
/// premiação completa) mora na página da categoria, que o card abre.
class TournamentDetailCategoryCard extends StatelessWidget {
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
  });

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

  void _openRegistrationSuccess(BuildContext context) {
    final regId = registration?.registrationId.trim() ?? '';
    if (regId.isEmpty || tournamentId.isEmpty) return;
    context.pushNamed(
      AppRouteNames.tournamentRegistrationSuccess,
      pathParameters: {'tournamentId': tournamentId},
      extra: TournamentRegistrationSuccessArgs(
        tournamentId: tournamentId,
        registrationId: regId,
        tournamentName: tournamentName,
        categoryName: offer.name,
      ),
      queryParameters: {
        'registrationId': regId,
        'tournamentName': tournamentName,
        'categoryName': offer.name,
      },
    );
  }

  void _openCategoryView(BuildContext context) {
    if (tournamentId.isEmpty || offer.id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.tournamentCategoryView,
      pathParameters: {'tournamentId': tournamentId, 'categoryId': offer.id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final isRegistrationPaid = registration?.isPaid == true;
    final isEnrolled = isRegistrationPaid || isOnWaitlist;
    final status = tournamentCategoryRowStatus(
      offer,
      inscriptionCount: inscriptionCount,
      tournamentStatus: tournamentStatus,
    );
    final vacancy = tournamentCategoryVacancyUi(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final ctaKind = tournamentCategoryCtaKindForAthlete(
      offer: offer,
      tournamentStatus: tournamentStatus,
      isRegistrationPaid: isRegistrationPaid,
      inscriptionCount: inscriptionCount,
      registrationNotYetOpen: registrationNotYetOpen,
    );
    final family = categoryLevelFamily(offer);
    final accent = categoryLevelAccent(family);
    final prizesTotal = tournamentCategoryPrizesTotal(offer);
    // Torneio finalizado: taxa e vagas viram informação vencida — sobra a
    // identidade, o formato e o que a categoria pagou.
    final isTournamentOver = isTournamentTerminal(tournamentStatus);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Fio da cor do nível: identifica a faixa antes de ler o nome.
          Container(
            height: 3,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(17),
              ),
              gradient: LinearGradient(
                colors: [accent, accent.withValues(alpha: 0)],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _CategoryHeadline(
                  offer: offer,
                  family: family,
                  accent: accent,
                  isEnrolled: isEnrolled,
                  isOnWaitlist: isOnWaitlist,
                  status: status,
                ),
                const SizedBox(height: 14),
                _CategoryMetaRow(
                  vacancy: vacancy,
                  formatLabel: tournamentCategoryShortFormatTag(offer),
                  feeLabel: formatCategoryEntryFee(offer),
                  prizesLabel: prizesTotal > 0 ? formatBRL(prizesTotal) : null,
                  showSpots: !isTournamentOver,
                  showFee: !isTournamentOver,
                  showPrizes: isTournamentOver,
                ),
                if (ctaKind != TournamentCategoryCtaKind.disabled) ...[
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerRight,
                    child: _CategoryCtaButton(
                      kind: ctaKind,
                      accent: accent,
                      onPressed: switch (ctaKind) {
                        TournamentCategoryCtaKind.register => onRegister,
                        TournamentCategoryCtaKind.waitlist => onRegister,
                        TournamentCategoryCtaKind.viewRegistration => () =>
                            _openRegistrationSuccess(context),
                        TournamentCategoryCtaKind.viewCategory => () =>
                            _openCategoryView(context),
                        TournamentCategoryCtaKind.disabled => null,
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryHeadline extends StatelessWidget {
  const _CategoryHeadline({
    required this.offer,
    required this.family,
    required this.accent,
    required this.isEnrolled,
    required this.isOnWaitlist,
    required this.status,
  });

  final TournamentCategoryOffer offer;
  final CategoryLevelFamily family;
  final Color accent;
  final bool isEnrolled;
  final bool isOnWaitlist;
  final TournamentCategoryRowStatus status;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.16),
            shape: BoxShape.circle,
            border: Border.all(color: accent.withValues(alpha: 0.4)),
          ),
          child: Icon(categoryLevelIcon(family), size: 24, color: accent),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                offer.name,
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                categoryLevelTagline(family),
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        if (isEnrolled)
          _StatePill(
            label: isOnWaitlist ? 'NA FILA' : 'INSCRITO',
            color: isOnWaitlist ? AppColors.pending : AppColors.win,
          )
        else if (status.isClosed)
          _StatePill(label: status.label, color: status.color)
        else
          Icon(
            Icons.chevron_right_rounded,
            size: 22,
            color: context.themeColors.onSurfaceMuted,
          ),
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
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.45)),
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

class _CategoryMetaRow extends StatelessWidget {
  const _CategoryMetaRow({
    required this.vacancy,
    required this.formatLabel,
    required this.feeLabel,
    required this.prizesLabel,
    required this.showSpots,
    required this.showFee,
    required this.showPrizes,
  });

  final TournamentCategoryVacancyUi vacancy;
  final String formatLabel;
  final String feeLabel;
  final String? prizesLabel;
  final bool showSpots;
  final bool showFee;
  final bool showPrizes;

  @override
  Widget build(BuildContext context) {
    final showPrizeItem = showPrizes && prizesLabel != null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showSpots)
          Expanded(
            flex: 3,
            child: _MetaItem(
              icon: Icons.groups_rounded,
              value: vacancy.total > 0
                  ? '${vacancy.enrolled}/${vacancy.total}'
                  : '—',
              caption: 'equipes',
            ),
          ),
        Expanded(
          flex: 4,
          child: _MetaItem(
            icon: Icons.account_tree_rounded,
            value: formatLabel,
          ),
        ),
        if (showFee)
          Expanded(
            flex: 4,
            child: _MetaItem(
              icon: Icons.sell_rounded,
              value: feeLabel,
              caption: 'por equipe',
              valueColor: AppColors.brand,
            ),
          ),
        if (showPrizeItem)
          Expanded(
            flex: 4,
            child: _MetaItem(
              icon: Icons.emoji_events_rounded,
              value: prizesLabel!,
              caption: 'em prêmios',
              valueColor: AppColors.brand,
            ),
          ),
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  const _MetaItem({
    required this.icon,
    required this.value,
    this.caption,
    this.valueColor,
  });

  final IconData icon;
  final String value;
  final String? caption;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: muted),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: valueColor ?? context.themeColors.onSurface,
                  height: 1.2,
                ),
              ),
              if (caption != null)
                Text(
                  caption!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w500,
                    color: muted,
                    height: 1.3,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryCtaButton extends StatelessWidget {
  const _CategoryCtaButton({
    required this.kind,
    required this.accent,
    this.onPressed,
  });

  final TournamentCategoryCtaKind kind;
  final Color accent;
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
          minimumSize: const Size(0, 42),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
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
    final foreground = enabled
        ? context.themeColors.onSurface
        : context.themeColors.onSurfaceMuted;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: foreground,
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        side: BorderSide(
          color: enabled
              ? accent.withValues(alpha: 0.45)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
