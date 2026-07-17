import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/athlete_discover_logic.dart';
import '../../../domain/athlete_discover_models.dart';
import '../../../domain/athlete_discover_providers.dart';
import '../../../domain/athlete_follow_providers.dart';
import '../../../domain/athlete_profile.dart';
import '../../../../friendly_match/domain/friendly_match_providers.dart';
import '../athlete_profile_avatar.dart';

class AthleteDiscoverCard extends ConsumerWidget {
  const AthleteDiscoverCard({
    super.key,
    required this.entry,
    required this.viewer,
    this.sportFirestoreId,
  });

  final AthleteDiscoverEntry entry;
  final AthleteProfile? viewer;
  final String? sportFirestoreId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final compatibility = computeDiscoverCompatibilityScore(
      viewer: viewer,
      target: entry.profile,
      sportFirestoreId: sportFirestoreId,
    );
    final statsLine = discoverStatsLine(
      entry: entry,
      viewer: viewer,
      sportFirestoreId: sportFirestoreId,
    );
    final contextTag = discoverContextTag(entry: entry, viewer: viewer);
    final badgeColor = discoverCompatibilityColor(compatibility);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': entry.userId},
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AthleteProfileAvatar(
                size: 52,
                initials: entry.initials,
                imageUrl: entry.profile.avatarUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            entry.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                        ),
                        if (compatibility > 0) ...[
                          const SizedBox(width: 8),
                          _CompatibilityBadge(
                            score: compatibility,
                            color: badgeColor,
                          ),
                        ],
                      ],
                    ),
                    if (statsLine.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        statsLine,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 12,
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.35,
                        ),
                      ),
                    ],
                    if (contextTag != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        contextTag,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _ActionColumn(entry: entry),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompatibilityBadge extends StatelessWidget {
  const _CompatibilityBadge({required this.score, required this.color});

  final int score;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: context.themeColors.outline.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.bolt_rounded, size: 14, color: color),
          const SizedBox(width: 3),
          Text(
            '$score%',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionColumn extends ConsumerWidget {
  const _ActionColumn({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        _FollowButton(entry: entry),
        // const SizedBox(height: 8),
        // _InviteButton(entry: entry),
      ],
    );
  }
}

class _FollowButton extends ConsumerStatefulWidget {
  const _FollowButton({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  ConsumerState<_FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends ConsumerState<_FollowButton> {
  var _loading = false;

  Future<void> _toggle() async {
    if (widget.entry.isCurrentUser) return;

    final uid = ref.read(authProvider).valueOrNull?.uid.trim();
    if (uid == null || uid.isEmpty) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para seguir atletas.');
      return;
    }

    final follow = !widget.entry.isFollowing;
    ref
        .read(athleteDiscoverProvider.notifier)
        .updateFollowing(widget.entry.userId, follow);
    setState(() => _loading = true);
    try {
      await ref
          .read(athleteFollowServiceProvider)
          .setFollowing(
            followerId: uid,
            athleteId: widget.entry.userId,
            follow: follow,
          );
    } catch (e) {
      ref
          .read(athleteDiscoverProvider.notifier)
          .updateFollowing(widget.entry.userId, !follow);
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível atualizar o follow.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.entry.isCurrentUser) return const SizedBox.shrink();

    final following = widget.entry.isFollowing;
    return SizedBox(
      height: 34,
      child: OutlinedButton(
        onPressed: _loading ? null : _toggle,
        style: OutlinedButton.styleFrom(
          foregroundColor: context.themeColors.onSurface,
          backgroundColor: following
              ? context.themeColors.surfaceRaised
              : Colors.transparent,
          side: BorderSide(
            color: context.themeColors.outline.withValues(alpha: 0.35),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          minimumSize: const Size(0, 34),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: _loading
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(
                following ? 'Seguindo' : 'Seguir',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
      ),
    );
  }
}

class _InviteButton extends ConsumerWidget {
  const _InviteButton({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(friendlyMatchConfigProvider).value;
    final viewerUid = ref.watch(authProvider).value?.uid;
    if (config == null || !config.enabled) return const SizedBox.shrink();
    if (entry.userId.isEmpty || entry.userId == viewerUid) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: 36,
      child: OutlinedButton.icon(
        onPressed: () => context.push(
          Uri(
            path: AppRoutes.friendlyMatchNew,
            queryParameters: {
              'toUid': entry.userId,
              'toName': entry.displayName,
            },
          ).toString(),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.brand,
          side: const BorderSide(color: AppColors.brand),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          minimumSize: const Size(0, 36),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        icon: const Icon(Icons.send_rounded, size: 16),
        label: Text(
          'Convidar',
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
