import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_category_spots.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_success_args.dart';

class TournamentDetailCategoriesCard extends StatelessWidget {
  const TournamentDetailCategoriesCard({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
    required this.offers,
    this.enrollmentByCategoryId = const {},
    this.enrollmentCountsResolved = false,
    this.registrationsByCategoryId = const {},
  });

  final String tournamentId;
  final String tournamentName;
  final List<TournamentCategoryOffer> offers;
  final Map<String, int> enrollmentByCategoryId;
  final bool enrollmentCountsResolved;
  final TournamentUserRegistrationsByCategory registrationsByCategoryId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'CATEGORIAS',
            style: AppTypography.mono(
              fontSize: 11,
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.8,
            ),
          ),
          if (offers.isEmpty) ...[
            SizedBox(height: 12),
            Text(
              'Categorias serão publicadas em breve pelo organizador.',
              style: AppTypography.soraRegular(
                fontSize: 14,
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ] else ...[
            SizedBox(height: 12),
            for (var i = 0; i < offers.length; i++) ...[
              if (i > 0)
                Divider(
                  height: 20,
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              _CategoryRow(
                offer: offers[i],
                inscriptionCount: resolveInscriptionCountForOffer(
                  enrollmentByCategoryId,
                  offers[i],
                  countsResolved: enrollmentCountsResolved,
                ),
                registration: registrationsByCategoryId[offers[i].id],
                tournamentId: tournamentId,
                tournamentName: tournamentName,
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.offer,
    required this.tournamentId,
    required this.tournamentName,
    this.inscriptionCount,
    this.registration,
  });

  final TournamentCategoryOffer offer;
  final String tournamentId;
  final String tournamentName;
  final int? inscriptionCount;
  final UserCategoryRegistration? registration;

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

  @override
  Widget build(BuildContext context) {
    final isRegistrationPaid = registration?.isPaid == true;
    final isEnrolled = isRegistrationPaid;
    final status = tournamentCategoryRowStatus(
      offer,
      inscriptionCount: inscriptionCount,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    offer.name,
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    tournamentCategorySubtitle(offer),
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(width: 8),
            if (isEnrolled)
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
              )
            else if (status.isClosed)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
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
        if (isEnrolled && !offer.isCompleted) ...[
          SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => _openRegistrationSuccess(context),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.win,
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
          ),
        ],
      ],
    );
  }
}
