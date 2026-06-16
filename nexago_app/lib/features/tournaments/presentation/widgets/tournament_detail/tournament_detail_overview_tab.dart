import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_model.dart';
import 'tournament_detail_about_card.dart';
import 'tournament_detail_categories_card.dart';

class TournamentDetailOverviewTab extends StatelessWidget {
  const TournamentDetailOverviewTab({
    super.key,
    required this.tournament,
    required this.organizerName,
    this.leagueContextLabel,
    this.enrollmentByCategoryId = const {},
    this.enrollmentCountsResolved = false,
    this.registrationsByCategoryId = const {},
    this.waitlistByCategoryId = const {},
  });

  final TournamentDetail tournament;
  final String organizerName;
  final String? leagueContextLabel;
  final Map<String, int> enrollmentByCategoryId;
  final bool enrollmentCountsResolved;
  final Map<String, String> registrationsByCategoryId;
  final Map<String, bool> waitlistByCategoryId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (leagueContextLabel != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Text(
              leagueContextLabel!,
              style: theme.textTheme.labelMedium?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        TournamentDetailAboutCard(
          tournament: tournament,
          organizerName: organizerName,
        ),
        TournamentDetailCategoriesCard(
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          offers: tournament.categoryOffers,
          enrollmentByCategoryId: enrollmentByCategoryId,
          enrollmentCountsResolved: enrollmentCountsResolved,
          registrationsByCategoryId: registrationsByCategoryId,
        ),
      ],
    );
  }
}
