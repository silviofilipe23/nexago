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
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/athlete_public_profile_models.dart';
import '../athlete_profile_avatar.dart';

class AthleteDiscoverCard extends ConsumerWidget {
  const AthleteDiscoverCard({super.key, required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewer = ref.watch(athleteProfileProvider).valueOrNull;
    final distance = entry.proximityDistanceLabel(viewer);
    final now = DateTime.now();
    final isOnline =
        entry.supportsOnlineStatus && isAthleteOnline(entry.profile, now);
    final podiumStyle = _PodiumCardStyle.fromRank(entry.rankPosition, context);

    return Material(
      color: podiumStyle?.backgroundColor ?? context.themeColors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: podiumStyle != null
            ? BorderSide(color: podiumStyle.borderColor, width: 1.5)
            : BorderSide.none,
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': entry.userId},
        ),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _DiscoverAvatar(
                        initials: entry.initials,
                        imageUrl: entry.profile.avatarUrl,
                        isOnline: isOnline,
                        level: entry.levelSegments,
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
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
                                if (entry.displayCategory.isNotEmpty) ...[
                                  SizedBox(width: 6),
                                  _CategoryBadge(label: entry.displayCategory),
                                ],
                              ],
                            ),
                            SizedBox(height: 4),
                            _MetaRow(entry: entry, distance: distance),
                            SizedBox(height: 4),
                            _SocialStatsRow(entry: entry),
                          ],
                        ),
                      ),
                      SizedBox(width: 8),
                      _RankColumn(entry: entry),
                    ],
                  ),
                  SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          entry.primarySportLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                      SizedBox(width: 8),
                      _LevelDots(segments: entry.levelSegments),
                      SizedBox(width: 8),
                      Text(
                        entry.levelLabel,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              SizedBox(height: 12),
              Divider(
                height: 1,
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
              SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  if (entry.profile.lookingForPartner)
                    _LookingForPartnerBadge()
                  else
                    const Spacer(flex: 2),
                  if (entry.profile.lookingForPartner) SizedBox(width: 8),
                  Expanded(flex: 3, child: _FollowButton(entry: entry)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PodiumCardStyle {
  const _PodiumCardStyle({
    required this.backgroundColor,
    required this.borderColor,
  });

  final Color backgroundColor;
  final Color borderColor;

  static const _gold = Color(0xFFE5B82E);
  static const _silver = Color(0xFFB8BEC8);
  static const _bronze = Color(0xFFCD7F32);

  static _PodiumCardStyle? fromRank(int? rank, BuildContext context) {
    final base = context.themeColors.surfaceCard;
    return switch (rank) {
      1 => _PodiumCardStyle(
        backgroundColor: Color.lerp(base, _gold, 0.14)!,
        borderColor: _gold.withValues(alpha: 0.7),
      ),
      2 => _PodiumCardStyle(
        backgroundColor: Color.lerp(base, _silver, 0.14)!,
        borderColor: _silver.withValues(alpha: 0.75),
      ),
      3 => _PodiumCardStyle(
        backgroundColor: Color.lerp(base, _bronze, 0.14)!,
        borderColor: _bronze.withValues(alpha: 0.75),
      ),
      _ => null,
    };
  }
}

class _DiscoverAvatar extends StatelessWidget {
  const _DiscoverAvatar({
    required this.initials,
    this.imageUrl,
    required this.isOnline,
    required this.level,
  });

  final String initials;
  final String? imageUrl;
  final bool isOnline;
  final int level;

  static const _size = 52.0;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        AthleteProfileAvatar(
          size: _size,
          initials: initials,
          imageUrl: imageUrl,
          displayLevel: level,
        ),
        if (isOnline)
          Positioned(
            right: 10,
            top: 0,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: AppColors.win,
                shape: BoxShape.circle,
                border: Border.all(
                  color: context.themeColors.surfaceCard,
                  width: 2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.entry, this.distance});

  final AthleteDiscoverEntry entry;
  final String? distance;

  @override
  Widget build(BuildContext context) {
    final lines = <Widget>[];

    if (entry.locationLabel.isNotEmpty) {
      lines.add(
        _MetaLine(
          icon: Icons.location_city_outlined,
          child: _metaText(entry.locationLabel, context),
        ),
      );
    }
    if (distance != null) {
      lines.add(
        _MetaLine(
          icon: Icons.location_on_outlined,
          child: _metaText(distance!, context),
        ),
      );
    }
    final hasGender = entry.genderLabel.isNotEmpty;
    final hasAge = entry.ageYearsLabel.isNotEmpty;
    if (hasGender || hasAge) {
      final parts = <String>[
        if (hasGender) entry.genderLabel,
        if (hasAge) entry.ageYearsLabel,
      ];
      lines.add(_metaText(parts.join(' · '), context));
    }

    if (lines.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) SizedBox(height: 3),
          lines[i],
        ],
      ],
    );
  }

  Widget _metaText(String text, BuildContext context) {
    return Text(
      text,
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _SocialStatsRow extends StatelessWidget {
  const _SocialStatsRow({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[
      '${entry.formattedFollowersCount} seguidor${entry.followersCount == 1 ? '' : 'es'}',
    ];
    final mutual = entry.mutualFollowersCount;
    if (mutual != null) {
      parts.add(
        '${entry.formattedMutualFollowersCount} em comum',
      );
    }

    return Text(
      parts.join(' · '),
      style: AppTypography.mono(
        fontSize: 10,
        fontWeight: FontWeight.w600,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.child});

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 12,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.8),
        ),
        SizedBox(width: 4),
        child,
      ],
    );
  }
}

class _CategoryBadge extends StatelessWidget {
  const _CategoryBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.brand,
        ),
      ),
    );
  }
}

class _RankColumn extends StatelessWidget {
  const _RankColumn({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context) {
    final rank = entry.rankPosition;
    final podiumAccent = switch (rank) {
      1 => _PodiumCardStyle._gold,
      2 => _PodiumCardStyle._silver,
      3 => _PodiumCardStyle._bronze,
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'RANK GERAL',
          style: AppTypography.mono(
            fontSize: 8,
            fontWeight: FontWeight.w700,
            color: podiumAccent ?? context.themeColors.onSurfaceMuted,
            letterSpacing: 0.4,
          ),
        ),
        SizedBox(height: 2),
        Text(
          rank != null ? '#$rank' : '—',
          style: AppTypography.soraRegular(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: podiumAccent ?? context.themeColors.onSurface,
            height: 1,
          ),
        ),
        SizedBox(height: 2),
        Text(
          '${entry.formattedRankPoints} pts',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _LevelDots extends StatelessWidget {
  const _LevelDots({required this.segments});

  final int segments;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < athleteLevelSegmentCount; i++) ...[
          if (i > 0) SizedBox(width: 5),
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < segments
                  ? AppColors.brand
                  : context.themeColors.surfaceRaised,
            ),
          ),
        ],
      ],
    );
  }
}

class _LookingForPartnerBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Expanded(
      flex: 2,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.pending.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.pending.withValues(alpha: 0.55)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.person_search_rounded,
              size: 14,
              color: AppColors.pending,
            ),
            SizedBox(width: 6),
            Flexible(
              child: Text(
                'PROCURA DUPLA',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.pending,
                  letterSpacing: 0.6,
                ),
              ),
            ),
          ],
        ),
      ),
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
    if (widget.entry.isCurrentUser) {
      return const SizedBox.shrink();
    }

    final following = widget.entry.isFollowing;
    return SizedBox(
      height: 44,
      child: FilledButton(
        onPressed: _loading ? null : _toggle,
        style: FilledButton.styleFrom(
          backgroundColor: following
              ? context.themeColors.surfaceRaised
              : AppColors.brand,
          foregroundColor: following
              ? context.themeColors.onSurfaceMuted
              : AppColors.black,
          disabledBackgroundColor: context.themeColors.surfaceRaised,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: _loading
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.black,
                ),
              )
            : Text(
                following ? 'Seguindo' : 'Seguir',
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
      ),
    );
  }
}
