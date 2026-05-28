import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_success_args.dart';

class TournamentDetailCategoryCard extends StatelessWidget {
  const TournamentDetailCategoryCard({
    super.key,
    required this.offer,
    required this.tournamentId,
    required this.tournamentName,
    required this.tournamentStatus,
    required this.onRegister,
    this.inscriptionCount,
    this.registrationId,
  });

  final TournamentCategoryOffer offer;
  final String tournamentId;
  final String tournamentName;
  final TournamentListingStatus tournamentStatus;
  final VoidCallback? onRegister;
  final int? inscriptionCount;
  final String? registrationId;

  void _openRegistrationSuccess(BuildContext context) {
    final regId = registrationId?.trim() ?? '';
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

  @override
  Widget build(BuildContext context) {
    final isEnrolled = registrationId != null && registrationId!.isNotEmpty;
    final status = tournamentCategoryRowStatus(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final vacancy = tournamentCategoryVacancyUi(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final ctaKind = isEnrolled
        ? TournamentCategoryCtaKind.viewRegistration
        : tournamentCategoryCtaKind(
            offer,
            tournamentStatus,
            inscriptionCount: inscriptionCount,
          );
    final prizes = categoryPrizeRows(offer);
    final formatTag = tournamentCategoryFormatTag(offer);
    final genderTag = tournamentCategoryGenderTag(offer);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
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
                  offer.name,
                  style: AppTypography.soraRegular(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              if (isEnrolled)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.win.withValues(alpha: 0.45),
                    ),
                  ),
                  child: Text(
                    'INSCRITO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.win,
                      letterSpacing: 0.4,
                    ),
                  ),
                )
              else if (status.isClosed)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.live.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.live.withValues(alpha: 0.45),
                    ),
                  ),
                  child: Text(
                    status.label,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: status.color,
                      letterSpacing: 0.4,
                    ),
                  ),
                )
              else
                Text(
                  status.label,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: status.color,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _TagChip(label: genderTag),
              _TagChip(label: formatTag),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Text(
                'VAGAS',
                style: AppTypography.mono(
                  fontSize: 10,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.6,
                ),
              ),
              const Spacer(),
              Text(
                vacancy.total > 0
                    ? '${vacancy.enrolled}/${vacancy.total} equipes'
                    : '— equipes',
                style: AppTypography.mono(
                  fontSize: 11,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: vacancy.fill,
              minHeight: 5,
              backgroundColor: AppColors.onSurfaceMuted.withValues(alpha: 0.2),
              color: vacancy.barColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            vacancy.caption,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: vacancy.captionColor,
            ),
          ),
          const SizedBox(height: 16),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'TAXA',
                        style: AppTypography.mono(
                          fontSize: 10,
                          color: AppColors.onSurfaceMuted,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        formatCategoryEntryFee(offer),
                        style: AppTypography.soraRegular(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: AppColors.brand,
                          height: 1,
                        ),
                      ),
                      Text(
                        'por equipe',
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          color: AppColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (prizes.isNotEmpty) ...[
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'PREMIAÇÃO',
                          style: AppTypography.mono(
                            fontSize: 10,
                            color: AppColors.onSurfaceMuted,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (final row in prizes) ...[
                          _PrizeLine(row: row),
                          if (row != prizes.last) const SizedBox(height: 6),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          _CategoryCtaButton(
            kind: ctaKind,
            onPressed: switch (ctaKind) {
              TournamentCategoryCtaKind.register => onRegister,
              TournamentCategoryCtaKind.viewRegistration =>
                () => _openRegistrationSuccess(context),
              _ => null,
            },
          ),
        ],
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppColors.onSurfaceMuted,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _PrizeLine extends StatelessWidget {
  const _PrizeLine({required this.row});

  final CategoryPrizeRow row;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: row.highlight
                ? AppColors.brand
                : AppColors.onSurfaceMuted.withValues(alpha: 0.5),
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            row.positionLabel,
            style: AppTypography.soraRegular(
              fontSize: 13,
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Text(
          row.amountLabel,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: row.highlight ? AppColors.brand : AppColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _CategoryCtaButton extends StatelessWidget {
  const _CategoryCtaButton({required this.kind, this.onPressed});

  final TournamentCategoryCtaKind kind;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final label = tournamentCategoryCtaLabel(kind);
    final isPrimary = kind == TournamentCategoryCtaKind.register ||
        kind == TournamentCategoryCtaKind.viewRegistration;

    if (isPrimary) {
      final isEnrolled = kind == TournamentCategoryCtaKind.viewRegistration;
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor:
                isEnrolled ? AppColors.win : AppColors.brand,
            foregroundColor: AppColors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton(
        onPressed: null,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.onSurfaceMuted,
          side: BorderSide(
            color: kind == TournamentCategoryCtaKind.waitlist
                ? AppColors.live.withValues(alpha: 0.35)
                : AppColors.onSurfaceMuted.withValues(alpha: 0.2),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
