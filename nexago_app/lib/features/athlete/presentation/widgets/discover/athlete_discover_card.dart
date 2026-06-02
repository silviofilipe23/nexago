import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/athlete_discover_models.dart';
import '../../../domain/athlete_discover_providers.dart';
import '../../../domain/athlete_follow_providers.dart';
import '../../../domain/gamification_providers.dart';
import '../athlete_profile_avatar.dart';

class AthleteDiscoverCard extends ConsumerWidget {
  const AthleteDiscoverCard({super.key, required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gamification =
        ref.watch(gamificationSummaryByUserIdProvider(entry.userId));
    final displayLevel = gamification.valueOrNull?.level;

    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': entry.userId},
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AthleteProfileAvatar(
                    size: 52,
                    initials: entry.initials,
                    imageUrl: entry.profile.avatarUrl,
                    displayLevel: displayLevel,
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
                                  color: AppColors.onSurface,
                                ),
                              ),
                            ),
                            if (entry.displayCategory.isNotEmpty) ...[
                              const SizedBox(width: 6),
                              _CategoryBadge(label: entry.displayCategory),
                            ],
                          ],
                        ),
                        if (entry.handle != null && entry.handle!.isNotEmpty)
                          Text(
                            entry.handle!,
                            style: AppTypography.mono(
                              fontSize: 11,
                              color: AppColors.onSurfaceMuted,
                            ),
                          ),
                        const SizedBox(height: 4),
                        _RankRow(entry: entry),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _FollowButton(entry: entry),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                _metaLine(entry),
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      entry.primarySportLabel,
                      style: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                  ),
                  Text(
                    entry.levelLabel,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              _DiscoverLevelBar(segments: entry.levelSegments),
              if (entry.profile.lookingForPartner) ...[
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _metaLine(AthleteDiscoverEntry entry) {
    final parts = <String>[];
    if (entry.ageLabel.isNotEmpty) parts.add(entry.ageLabel);
    if (entry.genderShortLabel.isNotEmpty) parts.add(entry.genderShortLabel);
    final city = entry.profile.city.trim();
    if (city.isNotEmpty) parts.add(city);
    return parts.join(' · ');
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
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(6),
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

class _RankRow extends StatelessWidget {
  const _RankRow({required this.entry});

  final AthleteDiscoverEntry entry;

  @override
  Widget build(BuildContext context) {
    final rank = entry.rankPosition;
    final pts = entry.rankPoints;
    final rankLabel = rank != null ? '#$rank' : '—';
    return Text(
      '$rankLabel · $pts pts',
      style: AppTypography.mono(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: AppColors.onSurfaceMuted,
      ),
    );
  }
}

class _DiscoverLevelBar extends StatelessWidget {
  const _DiscoverLevelBar({required this.segments});

  final int segments;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < 5; i++)
          Expanded(
            child: Container(
              height: 5,
              margin: EdgeInsets.only(right: i < 4 ? 4 : 0),
              decoration: BoxDecoration(
                color: i < segments
                    ? AppColors.brand
                    : AppColors.surfaceRaised,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
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
    setState(() => _loading = true);
    try {
      await ref.read(athleteFollowServiceProvider).setFollowing(
            followerId: uid,
            athleteId: widget.entry.userId,
            follow: follow,
          );
      ref
          .read(athleteDiscoverProvider.notifier)
          .updateFollowing(widget.entry.userId, follow);
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
    if (widget.entry.isCurrentUser) {
      return const SizedBox.shrink();
    }

    final following = widget.entry.isFollowing;
    return SizedBox(
      height: 36,
      child: OutlinedButton(
        onPressed: _loading ? null : _toggle,
        style: OutlinedButton.styleFrom(
          foregroundColor: following ? AppColors.onSurfaceMuted : AppColors.brand,
          side: BorderSide(
            color: following
                ? AppColors.onSurfaceMuted.withValues(alpha: 0.4)
                : AppColors.brand,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          minimumSize: const Size(0, 36),
        ),
        child: _loading
            ? const SizedBox(
                width: 16,
                height: 16,
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
