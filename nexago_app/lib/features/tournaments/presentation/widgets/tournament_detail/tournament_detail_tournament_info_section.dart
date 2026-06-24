import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';

class TournamentDetailTournamentInfoSection extends StatelessWidget {
  const TournamentDetailTournamentInfoSection({
    super.key,
    required this.tournament,
    required this.organizerName,
    required this.stats,
  });

  final TournamentDetail tournament;
  final String organizerName;
  final TournamentDetailStats stats;

  @override
  Widget build(BuildContext context) {
    final mapsQuery = tournamentMapsQuery(tournament);
    final address = tournament.locationAddress?.trim();
    final locationLine = address != null && address.isNotEmpty
        ? address
        : tournamentDetailLocationSummary(tournament);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'O TORNEIO',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          _InfoCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: context.themeColors.onSurfaceMuted
                      .withValues(alpha: 0.12),
                  child: Icon(
                    Icons.person_outline_rounded,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        organizerName,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      Text(
                        'Organizador',
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // const SizedBox(height: 10),
          // _InfoCard(
          //   child: Column(
          //     children: [
          //       _InfoRow(
          //         label: 'Formato',
          //         value: tournamentDetailFormatSummary(tournament),
          //       ),
          //       const _InfoDivider(),
          //       _InfoRow(
          //         label: 'Data',
          //         value: tournamentDetailLongDate(tournament),
          //       ),
          //       const _InfoDivider(),
          //       _InfoRow(
          //         label: 'Categorias',
          //         value: tournamentExploreCategoriesSubtitle(stats),
          //       ),
          //       const _InfoDivider(),
          //       _InfoRow(
          //         label: 'Inscrição',
          //         value: tournamentDetailInscriptionInfoValue(tournament),
          //       ),
          //     ],
          //   ),
          // ),
          const SizedBox(height: 10),
          _InfoCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.location_on_outlined,
                  size: 20,
                  color: AppColors.brand,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tournament.location,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        locationLine,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: mapsQuery.trim().isEmpty
                      ? null
                      : () => _openMaps(mapsQuery),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text(
                    'Rotas',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
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

  Future<void> _openMaps(String query) async {
    final uri = Uri.parse(ArenaBookingSuccessActions.buildMapsSearchUrl(query));
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: child,
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoDivider extends StatelessWidget {
  const _InfoDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Divider(
        height: 1,
        thickness: 1,
        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
      ),
    );
  }
}
