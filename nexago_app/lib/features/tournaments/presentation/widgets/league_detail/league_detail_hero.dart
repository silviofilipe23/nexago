import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/league_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';

class LeagueDetailHero extends StatelessWidget {
  const LeagueDetailHero({
    super.key,
    required this.league,
    required this.topInset,
    required this.onBack,
    required this.onBookmark,
    required this.onShare,
  });

  final DiscoveryLeague league;
  final double topInset;
  final VoidCallback onBack;
  final VoidCallback onBookmark;
  final VoidCallback onShare;

  static const _horizontalMargin = 20.0;
  static const _coverContentHeight = 248.0;

  @override
  Widget build(BuildContext context) {
    final coverUrl = league.coverUrl?.trim();
    final hasCover = coverUrl != null && coverUrl.isNotEmpty;
    final onCover = Colors.white;
    final onCoverMuted = Colors.white.withValues(alpha: 0.72);
    final statusLabel = leagueStatusBadgeLabel(league.listingStatus);
    final stagesLabel = leagueStagesBadgeLabel(league);
    final seasonLabel = leagueSeasonDateLabel(league);
    final locationLabel = leagueLocationLabel(
      city: league.city,
      state: league.state,
    );
    final orgName = league.organizationName?.trim();

    return SizedBox(
      height: topInset + _coverContentHeight,
      child: Stack(
        clipBehavior: Clip.none,
        fit: StackFit.expand,
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: -topInset,
            bottom: 0,
            child: _LeagueHeroCoverBackground(
              imageUrl: hasCover ? coverUrl : null,
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: topInset),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
                child: Row(
                  children: [
                    IconButton(
                      icon: Icon(
                        Icons.arrow_back_rounded,
                        color: hasCover
                            ? onCover
                            : context.themeColors.onSurface,
                      ),
                      onPressed: onBack,
                    ),
                    const Spacer(),
                    IconButton(
                      icon: Icon(
                        Icons.bookmark_border_rounded,
                        color: hasCover
                            ? onCover
                            : context.themeColors.onSurface,
                      ),
                      onPressed: onBookmark,
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.ios_share_rounded,
                        color: hasCover
                            ? onCover
                            : context.themeColors.onSurface,
                      ),
                      onPressed: onShare,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    _horizontalMargin,
                    4,
                    _horizontalMargin,
                    16,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _LeagueStatusBadge(label: statusLabel),
                          _LeagueStageBadge(label: stagesLabel),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        league.name,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: FontWeight.w900,
                              color: hasCover
                                  ? onCover
                                  : context.themeColors.onSurface,
                              letterSpacing: -0.5,
                              height: 1.12,
                            ),
                      ),
                      if (orgName != null && orgName.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          orgName,
                          style: themeBody(context, hasCover, onCoverMuted)
                              .copyWith(fontWeight: FontWeight.w500),
                        ),
                      ],
                      const SizedBox(height: 10),
                      _MetaRow(
                        icon: Icons.calendar_today_outlined,
                        label: seasonLabel,
                        iconColor: hasCover
                            ? onCoverMuted
                            : context.themeColors.onSurfaceMuted,
                        textColor: hasCover
                            ? onCover.withValues(alpha: 0.9)
                            : context.themeColors.onSurface.withValues(
                                alpha: 0.88,
                              ),
                      ),
                      const SizedBox(height: 6),
                      _MetaRow(
                        icon: Icons.location_on_outlined,
                        label: locationLabel,
                        iconColor: hasCover
                            ? onCoverMuted
                            : context.themeColors.onSurfaceMuted,
                        textColor: hasCover
                            ? onCover.withValues(alpha: 0.9)
                            : context.themeColors.onSurface.withValues(
                                alpha: 0.88,
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  TextStyle themeBody(
    BuildContext context,
    bool hasCover,
    Color onCoverMuted,
  ) {
    return Theme.of(context).textTheme.bodyMedium!.copyWith(
          color: hasCover
              ? onCoverMuted
              : context.themeColors.onSurfaceMuted,
        );
  }
}

class _LeagueHeroCoverBackground extends StatelessWidget {
  const _LeagueHeroCoverBackground({this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final canvas = context.themeColors.canvas;

    return Stack(
      fit: StackFit.expand,
      children: [
        if (imageUrl != null)
          CachedNetworkImage(
            imageUrl: imageUrl!,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (_, __) => const _CoverPlaceholder(),
            errorWidget: (_, __, ___) => const _CoverPlaceholder(),
          )
        else
          const _CoverPlaceholder(),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.black.withValues(alpha: 0.35),
                AppColors.black.withValues(alpha: 0.55),
                canvas.withValues(alpha: 0.92),
                canvas,
              ],
              stops: const [0.0, 0.45, 0.88, 1.0],
            ),
          ),
        ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.topCenter,
                radius: 1.2,
                colors: [
                  AppColors.brand.withValues(alpha: 0.22),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.18),
            context.themeColors.surfaceRaised,
          ],
        ),
      ),
    );
  }
}

class _LeagueStatusBadge extends StatelessWidget {
  const _LeagueStatusBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.black,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: AppColors.black,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _LeagueStageBadge extends StatelessWidget {
  const _LeagueStageBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: Colors.white.withValues(alpha: 0.88),
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.label,
    required this.iconColor,
    required this.textColor,
  });

  final IconData icon;
  final String label;
  final Color iconColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: iconColor),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: textColor,
                  fontWeight: FontWeight.w500,
                ),
          ),
        ),
      ],
    );
  }
}
