import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/profiles/app_user_profile.dart';
import '../../../athlete/domain/sand_rank/sand_rank_catalog.dart';
import '../../../athlete/domain/sand_rank/sand_rank_providers.dart';
import '../../../athlete/presentation/sand_rank/widgets/sand_rank_emblem.dart';
import '../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../domain/friendly_match_logic.dart';
import '../../domain/friendly_match_models.dart';

/// Card de convite/jogo do hub — layout do protótipo com ações inline.
class FriendlyMatchCard extends ConsumerWidget {
  const FriendlyMatchCard({
    super.key,
    required this.match,
    required this.currentUid,
    required this.onTap,
    this.onAccept,
    this.onDecline,
    this.busy = false,
    this.highlightPending = false,
  });

  final FriendlyMatch match;
  final String currentUid;
  final VoidCallback onTap;
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final bool busy;
  final bool highlightPending;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final otherName = match.otherName(currentUid);
    final otherPhoto = match.otherPhotoUrl(currentUid);
    final sandRankEnabled =
        ref.watch(sandRankEnabledProvider).valueOrNull ?? false;
    final otherRank = sandRankEnabled
        ? ref
            .watch(
              publicSandRankByUserIdProvider(match.otherUid(currentUid)),
            )
            .valueOrNull
            ?.rank
        : null;
    final otherRankStep = otherRank != null
        ? sandRankStepByTrackIndex(otherRank.trackIndex)
        : null;
    final initials = initialsFromDisplayName(otherName);
    final now = DateTime.now();
    final needsMyAction =
        nextActionFor(currentUid, match, now) == FriendlyMatchNextAction.respond;
    final showActions =
        needsMyAction && onAccept != null && onDecline != null;
    final score = match.scoreAtSend;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: highlightPending && needsMyAction
              ? AppColors.brand.withValues(alpha: 0.35)
              : colors.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.vertical(
                top: const Radius.circular(16),
                bottom: Radius.circular(showActions ? 0 : 16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _MatchAvatar(
                      initials: initials,
                      photoUrl: otherPhoto,
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
                                  otherName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.soraRegular(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: colors.onSurface,
                                  ),
                                ),
                              ),
                              if (otherRankStep != null) ...[
                                const SizedBox(width: 6),
                                Tooltip(
                                  message:
                                      'Elo ${sandRankLabel(otherRankStep)}',
                                  child: SandRankEmblem(
                                    rankCode: otherRankStep.rankCode,
                                    division: otherRankStep.division,
                                    size: SandRankEmblemSize.small,
                                  ),
                                ),
                              ],
                              if (score != null) ...[
                                const SizedBox(width: 8),
                                _CompatibilityBadge(score: score),
                              ],
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            friendlyMatchSummaryLine(match),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.mono(
                              fontSize: 12,
                              color: colors.onSurfaceMuted,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            match.location.displayLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.mono(
                              fontSize: 12,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (showActions)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : onDecline,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: colors.onSurface,
                        side: BorderSide(
                          color: colors.outline.withValues(alpha: 0.35),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Recusar',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: busy ? null : onAccept,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Aceitar convite',
                        style: TextStyle(fontWeight: FontWeight.w800),
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
}

class _MatchAvatar extends StatelessWidget {
  const _MatchAvatar({
    required this.initials,
    this.photoUrl,
  });

  final String initials;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl?.trim();
    return SizedBox(
      width: 48,
      height: 48,
      child: ClipOval(
        child: url != null && url.isNotEmpty
            ? Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => AthleteProfileAvatarInitials(
                  initials: initials,
                  size: 48,
                ),
              )
            : AthleteProfileAvatarInitials(
                initials: initials,
                size: 48,
              ),
      ),
    );
  }
}

class _CompatibilityBadge extends StatelessWidget {
  const _CompatibilityBadge({required this.score});

  final int score;

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
          const Icon(
            Icons.bolt_rounded,
            size: 14,
            color: AppColors.pending,
          ),
          const SizedBox(width: 3),
          Text(
            '$score %',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.pending,
            ),
          ),
        ],
      ),
    );
  }
}
