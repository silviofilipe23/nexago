import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../athlete/domain/athlete_follow_providers.dart';
import '../../../../athlete/domain/athlete_profile_providers.dart';
import '../../../domain/team_discover_models.dart';
import '../../../domain/team_discover_providers.dart';

class TeamDiscoverCard extends ConsumerWidget {
  const TeamDiscoverCard({super.key, required this.entry});

  final TeamDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewer = ref.watch(athleteProfileProvider).valueOrNull;
    final distance = entry.proximityDistanceLabel(viewer);
    final together = entry.monthsTogetherShort;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => context.pushNamed(
                AppRouteNames.athleteProfile,
                queryParameters: {'userId': entry.followTargetUserId},
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _DualAvatars(entry: entry),
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
                            if (entry.membersLabel.isNotEmpty) ...[
                              SizedBox(height: 2),
                              Text(
                                entry.membersLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.mono(
                                  fontSize: 11,
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                              ),
                            ],
                            SizedBox(height: 4),
                            Text(
                              entry.primarySportLabel,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.soraRegular(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                                height: 1.25,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 8),
                      _RankColumn(entry: entry),
                    ],
                  ),
                  SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _LevelDots(segments: entry.levelSegments),
                      ),
                      if (distance != null) ...[
                        SizedBox(width: 12),
                        Icon(
                          Icons.location_on_outlined,
                          size: 14,
                          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.8),
                        ),
                        SizedBox(width: 2),
                        Text(
                          distance,
                          style: AppTypography.mono(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (entry.isLookingForPartner) ...[
                    SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.brand.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: AppColors.brand.withValues(alpha: 0.35),
                          ),
                        ),
                        child: Text(
                          'PROCURA DUPLA',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: AppColors.brand,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (together != null)
                  Expanded(
                    flex: 2,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.bolt_rounded,
                          size: 16,
                          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
                        ),
                        SizedBox(width: 4),
                        Flexible(
                          child: Text.rich(
                            TextSpan(
                              style: AppTypography.soraRegular(
                                fontSize: 12,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                              children: [
                                const TextSpan(text: 'juntos há '),
                                TextSpan(
                                  text: together,
                                  style: AppTypography.soraRegular(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: context.themeColors.onSurface,
                                  ),
                                ),
                              ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  Spacer(flex: 2),
                SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: _FollowButton(entry: entry),
                ),
                SizedBox(width: 8),
                _InviteIconButton(
                  onPressed: () => showAppSnackBar(
                    context,
                    'Convite por raio — em breve.',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Avatares quadrados sobrepostos (protótipo).
class _DualAvatars extends StatelessWidget {
  const _DualAvatars({required this.entry});

  final TeamDiscoverEntry entry;

  static const _size = 46.0;
  static const _radius = 12.0;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 76,
      height: 56,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 0,
            top: 0,
            child: _TeamDiscoverAvatar(
              size: _size,
              borderRadius: _radius,
              initials: entry.player1Initials,
              imageUrl: entry.player1?.avatarUrl,
              accent: const Color(0xFF6B7A3A),
              initialsColor: const Color(0xFFE8D44D),
            ),
          ),
          if (!entry.isLookingForPartner)
            Positioned(
              right: 0,
              bottom: 0,
              child: _TeamDiscoverAvatar(
                size: _size,
                borderRadius: _radius,
                initials: entry.player2Initials,
                imageUrl: entry.player2?.avatarUrl,
                accent: const Color(0xFF6B4428),
                initialsColor: AppColors.brand,
              ),
            ),
        ],
      ),
    );
  }
}

class _TeamDiscoverAvatar extends StatelessWidget {
  const _TeamDiscoverAvatar({
    required this.size,
    required this.borderRadius,
    required this.initials,
    this.imageUrl,
    required this.accent,
    required this.initialsColor,
  });

  final double size;
  final double borderRadius;
  final String initials;
  final String? imageUrl;
  final Color accent;
  final Color initialsColor;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    final hasImage = url != null && url.isNotEmpty;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: context.themeColors.onSurface, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius - 2),
        child: hasImage
            ? CachedNetworkImage(
                imageUrl: url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => _InitialsFace(
                  initials: initials,
                  accent: accent,
                  initialsColor: initialsColor,
                ),
              )
            : _InitialsFace(
                initials: initials,
                accent: accent,
                initialsColor: initialsColor,
              ),
      ),
    );
  }
}

class _InitialsFace extends StatelessWidget {
  const _InitialsFace({
    required this.initials,
    required this.accent,
    required this.initialsColor,
  });

  final String initials;
  final Color accent;
  final Color initialsColor;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.95),
            accent.withValues(alpha: 0.65),
            accent.withValues(alpha: 0.85),
          ],
          stops: const [0.0, 0.45, 1.0],
        ),
      ),
      child: CustomPaint(
        painter: _DiagonalStripePainter(
          color: Colors.white.withValues(alpha: 0.06),
        ),
        child: Center(
          child: Text(
            initials,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: initialsColor,
              letterSpacing: -0.3,
            ),
          ),
        ),
      ),
    );
  }
}

class _DiagonalStripePainter extends CustomPainter {
  _DiagonalStripePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    const stripeWidth = 6.0;
    for (var x = -size.height; x < size.width + size.height; x += stripeWidth * 2) {
      canvas.drawRect(
        Rect.fromLTWH(x, 0, stripeWidth, size.height),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.25),
        ),
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

  final TeamDiscoverEntry entry;

  @override
  Widget build(BuildContext context) {
    final rank = entry.rankPosition;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'RANK',
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        SizedBox(height: 2),
        Text(
          rank != null ? '#$rank' : '—',
          style: AppTypography.soraRegular(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
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
        for (var i = 0; i < 5; i++) ...[
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

class _InviteIconButton extends StatelessWidget {
  const _InviteIconButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
            ),
          ),
          child: Icon(
            Icons.bolt_rounded,
            size: 20,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.75),
          ),
        ),
      ),
    );
  }
}

class _FollowButton extends ConsumerStatefulWidget {
  const _FollowButton({required this.entry});

  final TeamDiscoverEntry entry;

  @override
  ConsumerState<_FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends ConsumerState<_FollowButton> {
  var _loading = false;

  Future<void> _toggle() async {
    if (widget.entry.isCurrentUserTeam) return;

    final uid = ref.read(authProvider).valueOrNull?.uid.trim();
    if (uid == null || uid.isEmpty) {
      if (!mounted) return;
      showAppSnackBar(context, 'Faça login para seguir atletas.');
      return;
    }

    final athleteId = widget.entry.followTargetUserId;
    final follow = !widget.entry.isFollowing;
    setState(() => _loading = true);
    try {
      await ref.read(athleteFollowServiceProvider).setFollowing(
            followerId: uid,
            athleteId: athleteId,
            follow: follow,
          );
      ref
          .read(teamDiscoverProvider.notifier)
          .updateFollowing(athleteId, follow);
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível atualizar o follow.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.entry.isCurrentUserTeam) {
      return const SizedBox.shrink();
    }

    final following = widget.entry.isFollowing;
    return SizedBox(
      height: 44,
      child: FilledButton(
        onPressed: _loading ? null : _toggle,
        style: FilledButton.styleFrom(
          backgroundColor:
              following ? context.themeColors.surfaceRaised : AppColors.brand,
          foregroundColor: following ? context.themeColors.onSurfaceMuted : AppColors.black,
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
