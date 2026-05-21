import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';

/// Card de torneio com capa, status e vagas (paridade visual com [ArenaCard]).
class TournamentDiscoveryCard extends StatelessWidget {
  const TournamentDiscoveryCard({
    super.key,
    required this.tournament,
    required this.onTap,
    this.imageHeight = 156,
  });

  final DiscoveryTournament tournament;
  final VoidCallback onTap;
  final double imageHeight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = tournamentStatusColor(tournament.status);
    final fillRatio = tournament.spotsTotal > 0
        ? 1 - (tournament.spotsLeft / tournament.spotsTotal)
        : 0.0;
    final imageUrl = tournament.imageUrl?.trim();
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;

    return Material(
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: tournament.featured
                  ? AppColors.brand.withValues(alpha: 0.45)
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: imageHeight,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _TournamentCoverImage(
                      imageUrl: hasImage ? imageUrl : null,
                      featured: tournament.featured,
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 72,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              AppColors.black.withValues(alpha: 0.75),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (tournament.featured)
                      Positioned(
                        top: 10,
                        left: 10,
                        child: _FeaturedBadge(theme: theme),
                      ),
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: _StatusChip(
                        label: tournamentStatusLabel(tournament.status),
                        color: statusColor,
                        live: tournament.status == TournamentListingStatus.live ||
                            tournament.liveMatchesNow > 0,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournament.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                        letterSpacing: -0.3,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${tournament.location} · ${tournament.city}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      tournament.dateLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ...tournament.categories.map(
                          (c) => _MetaChip(label: tournamentCategoryLabel(c)),
                        ),
                        _MetaChip(label: tournamentFormatLabel(tournament.format)),
                        _MetaChip(label: tournament.priceLabel),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: fillRatio.clamp(0.0, 1.0),
                              minHeight: 6,
                              backgroundColor:
                                  AppColors.onSurfaceMuted.withValues(alpha: 0.2),
                              color: statusColor,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          tournament.spotsLeft > 0
                              ? '${tournament.spotsLeft} vagas'
                              : 'Lotado',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppColors.onSurfaceMuted,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    if (tournament.liveMatchesNow > 0) ...[
                      const SizedBox(height: 8),
                      Text(
                        '${tournament.liveMatchesNow} jogos ao vivo agora',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.live,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TournamentCoverImage extends StatelessWidget {
  const _TournamentCoverImage({
    required this.imageUrl,
    required this.featured,
  });

  final String? imageUrl;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    if (imageUrl != null) {
      return CachedNetworkImage(
        imageUrl: imageUrl!,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 220),
        placeholder: (_, __) => const _CoverPlaceholder(),
        errorWidget: (_, __, ___) => const _CoverPlaceholder(),
      );
    }
    return _CoverPlaceholder(featured: featured);
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({this.featured = false});

  final bool featured;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: featured
              ? [
                  AppColors.brand.withValues(alpha: 0.35),
                  AppColors.surfaceCard,
                ]
              : [
                  AppColors.surfaceCard,
                  AppColors.surfaceRaised,
                ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.sports_volleyball_rounded,
          size: 48,
          color: featured
              ? AppColors.brand.withValues(alpha: 0.85)
              : AppColors.onSurfaceMuted.withValues(alpha: 0.45),
        ),
      ),
    );
  }
}

class _FeaturedBadge extends StatelessWidget {
  const _FeaturedBadge({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'DESTAQUE',
        style: theme.textTheme.labelSmall?.copyWith(
          color: AppColors.black,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.color,
    this.live = false,
  });

  final String label;
  final Color color;
  final bool live;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.65)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (live) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});

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
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
      ),
    );
  }
}
