import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_tournaments_models.dart';
import '../../../domain/tournament_discovery_labels.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/my_tournaments_logic.dart';

class MyTournamentsEmptySuggestedCard extends StatelessWidget {
  const MyTournamentsEmptySuggestedCard({
    super.key,
    required this.tournament,
    required this.onTap,
    required this.onRegisterTap,
  });

  final DiscoveryTournament tournament;
  final VoidCallback onTap;
  final VoidCallback onRegisterTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = tournamentDiscoveryCardDateShort(tournament);
    final locationLine = [
      tournament.location.trim(),
      tournament.city.trim(),
      date,
    ].where((s) => s.isNotEmpty).join(' • ');
    final statusLine = openTournamentSpotsPriceLabel(tournament);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Material(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.themeColors.surfaceRaised),
            ),
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: MyTournamentsTokens.gold.withValues(alpha: 0.25),
                    ),
                  ),
                  child: Icon(
                    Icons.emoji_events_outlined,
                    color: MyTournamentsTokens.gold,
                    size: 22,
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tournament.name,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (locationLine.isNotEmpty) ...[
                        SizedBox(height: 4),
                        Text(
                          locationLine,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      SizedBox(height: 4),
                      Text(
                        statusLine,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppColors.win,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: onRegisterTap,
                    borderRadius: BorderRadius.circular(10),
                    child: Ink(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: MyTournamentsTokens.gold.withValues(alpha: 0.55),
                        ),
                      ),
                      child: Text(
                        'Inscrever',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: MyTournamentsTokens.gold,
                        ),
                      ),
                    ),
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
