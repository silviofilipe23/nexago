import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_detail_model.dart';

class PartnerInviteTournamentCard extends StatelessWidget {
  const PartnerInviteTournamentCard({
    super.key,
    required this.tournamentName,
    required this.categoryBadge,
    required this.dateLabel,
    required this.locationLabel,
    this.imageUrl,
  });

  final String tournamentName;
  final String categoryBadge;
  final String dateLabel;
  final String locationLabel;
  final String? imageUrl;

  factory PartnerInviteTournamentCard.fromDetail({
    required TournamentDetail tournament,
    required String categoryBadge,
    required String dateLabel,
  }) {
    return PartnerInviteTournamentCard(
      tournamentName: tournament.name,
      categoryBadge: categoryBadge,
      dateLabel: dateLabel,
      locationLabel: tournament.location.trim(),
      imageUrl: tournament.imageUrl,
    );
  }

  @override
  Widget build(BuildContext context) {
    final cover = imageUrl?.trim();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 64,
              height: 64,
              child: cover != null && cover.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: cover,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => _CoverPlaceholder(),
                      placeholder: (_, __) => _CoverPlaceholder(),
                    )
                  : const _CoverPlaceholder(),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tournamentName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    categoryBadge,
                    style: AppTypography.soraRegular(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                    ),
                  ),
                ),
                if (dateLabel.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _MetaRow(
                    icon: Icons.calendar_today_outlined,
                    label: dateLabel,
                  ),
                ],
                if (locationLabel.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  _MetaRow(
                    icon: Icons.location_on_outlined,
                    label: locationLabel,
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

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.themeColors.surfaceRaised,
      child: Center(
        child: Icon(
          Icons.image_outlined,
          size: 22,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          icon,
          size: 13,
          color: context.themeColors.onSurfaceMuted,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ],
    );
  }
}
