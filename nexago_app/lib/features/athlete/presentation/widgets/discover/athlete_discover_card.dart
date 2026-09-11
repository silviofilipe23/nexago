import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_discover_logic.dart';
import '../../../domain/athlete_discover_models.dart';
import '../athlete_profile_avatar.dart';

class AthleteDiscoverCard extends StatefulWidget {
  const AthleteDiscoverCard({
    super.key,
    required this.entry,
  });

  final AthleteDiscoverEntry entry;

  @override
  State<AthleteDiscoverCard> createState() => _AthleteDiscoverCardState();
}

class _AthleteDiscoverCardState extends State<AthleteDiscoverCard> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final statsLine = discoverStatsLine(entry: entry).toUpperCase();
    final contextTag = discoverContextTag(entry: entry)?.toUpperCase();

    return AnimatedScale(
      scale: _pressed ? 0.97 : 1,
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': entry.userId},
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              AthleteProfileAvatar(
                size: 36,
                initials: entry.initials,
                imageUrl: entry.profile.avatarUrl,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      entry.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    if (statsLine.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        statsLine,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.2,
                          letterSpacing: 0,
                        ),
                      ),
                    ],
                    if (contextTag != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        contextTag,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
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
