import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_category_spots.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_registration_logic.dart';
import '../../../domain/tournament_registration_success_args.dart';

class TournamentDetailCategoryPickSection extends StatelessWidget {
  const TournamentDetailCategoryPickSection({
    super.key,
    required this.tournament,
    required this.stats,
    required this.enrollmentByCategoryId,
    required this.enrollmentCountsResolved,
    required this.canAccessTournaments,
    required this.onRegisterBlocked,
    this.registrationsByCategoryId = const {},
    this.registrationResolved = false,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final Map<String, int> enrollmentByCategoryId;
  final bool enrollmentCountsResolved;
  final bool canAccessTournaments;
  final VoidCallback onRegisterBlocked;
  final TournamentUserRegistrationsByCategory registrationsByCategoryId;
  final bool registrationResolved;

  @override
  Widget build(BuildContext context) {
    final offer = firstOpenCategoryOffer(tournament);
    if (offer == null) return const SizedBox.shrink();

    final openCount = stats.openCategories;
    final inscriptionCount = resolveInscriptionCountForOffer(
      enrollmentByCategoryId,
      offer,
      countsResolved: enrollmentCountsResolved,
    );
    final vacancy = tournamentCategoryVacancyUi(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final genderLabel = categoryGenderDisplayLabel(offer);
    final formatTag = tournamentCategoryFormatTag(offer);
    final feeLabel = formatCategoryEntryFee(offer);
    final registration = registrationsByCategoryId[offer.id];
    final registrationId = registration?.registrationId.trim();
    final isRegistrationPaid = registration?.isPaid == true;
    final isEnrolled = isRegistrationPaid;

    void openRegistrationSuccess() {
      if (registrationId == null || registrationId.isEmpty) return;
      context.pushNamed(
        AppRouteNames.tournamentRegistrationSuccess,
        pathParameters: {'tournamentId': tournament.id},
        extra: TournamentRegistrationSuccessArgs(
          tournamentId: tournament.id,
          registrationId: registrationId,
          tournamentName: tournament.name,
          categoryName: offer.name,
        ),
        queryParameters: {
          'registrationId': registrationId,
          'tournamentName': tournament.name,
          'categoryName': offer.name,
        },
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'ESCOLHA SUA CATEGORIA',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.brand,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  'Onde sua dupla joga',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              Text(
                openCount == 1 ? '1 aberta' : '$openCount abertas',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.35),
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
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    Text(
                      feeLabel,
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _Chip(label: genderLabel),
                    _Chip(label: formatTag),
                    if (offer.level.trim().isNotEmpty)
                      _Chip(label: offer.level),
                  ],
                ),
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: vacancy.fill,
                    minHeight: 6,
                    backgroundColor: context.themeColors.onSurfaceMuted
                        .withValues(alpha: 0.12),
                    color: vacancy.barColor,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  vacancy.caption,
                  style: AppTypography.soraRegular(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: vacancy.captionColor,
                  ),
                ),
                const SizedBox(height: 14),
                if (isEnrolled) ...[
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
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
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: openRegistrationSuccess,
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.brand,
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          'Ver inscrição',
                          style: AppTypography.mono(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: AppColors.brand,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: registrationResolved
                          ? () {
                              if (!canAccessTournaments) {
                                onRegisterBlocked();
                                return;
                              }
                              context.pushNamed(
                                AppRouteNames.tournamentRegistration,
                                pathParameters: {'tournamentId': tournament.id},
                                queryParameters: {'categoryId': offer.id},
                              );
                            }
                          : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        disabledBackgroundColor: context
                            .themeColors
                            .onSurfaceMuted
                            .withValues(alpha: 0.2),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        'Inscrever minha dupla',
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: registrationResolved
                              ? AppColors.black
                              : context.themeColors.onSurfaceMuted,
                        ),
                      ),
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

class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}
