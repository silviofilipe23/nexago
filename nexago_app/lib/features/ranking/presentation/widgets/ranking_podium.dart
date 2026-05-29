import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_display_helpers.dart';
import '../../domain/ranking_list_models.dart';

/// Tamanhos dos avatares na tela de ranking.
abstract final class RankingAvatarSizes {
  static const list = 48.0;
  static const podiumFirst = 72.0;
  static const podiumOther = 58.0;
}

class RankingPodium extends StatelessWidget {
  const RankingPodium({
    super.key,
    required this.entries,
    this.onEntryTap,
  });

  final List<RankingListEntry> entries;
  final ValueChanged<RankingListEntry>? onEntryTap;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();

    final first = entries.where((e) => e.rank == 1).firstOrNull;
    final second = entries.where((e) => e.rank == 2).firstOrNull;
    final third = entries.where((e) => e.rank == 3).firstOrNull;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: second != null
              ? _PodiumSlot(
                  entry: second,
                  height: 88,
                  onTap: onEntryTap == null
                      ? null
                      : () => onEntryTap!(second),
                )
              : const SizedBox(height: 88),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: first != null
              ? _PodiumSlot(
                  entry: first,
                  height: 120,
                  onTap: onEntryTap == null ? null : () => onEntryTap!(first),
                )
              : const SizedBox(height: 120),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: third != null
              ? _PodiumSlot(
                  entry: third,
                  height: 72,
                  onTap: onEntryTap == null ? null : () => onEntryTap!(third),
                )
              : const SizedBox(height: 72),
        ),
      ],
    );
  }
}

class _PodiumSlot extends StatelessWidget {
  const _PodiumSlot({
    required this.entry,
    required this.height,
    this.onTap,
  });

  final RankingListEntry entry;
  final double height;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final rank = entry.rank;
    final isFirst = rank == 1;

    final content = Column(
      children: [
        RankingAvatarGroup(
          entry: entry,
          size: isFirst
              ? RankingAvatarSizes.podiumFirst
              : RankingAvatarSizes.podiumOther,
        ),
        const SizedBox(height: 8),
        Text(
          entry.displayName,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: isFirst ? 14 : 12,
            fontWeight: FontWeight.w700,
            color: AppColors.onSurface,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          formatRankingPoints(entry.points),
          style: AppTypography.soraRegular(
            fontSize: isFirst ? 22 : 16,
            fontWeight: FontWeight.w800,
            color: isFirst ? AppColors.brand : AppColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          height: height,
          alignment: Alignment.bottomCenter,
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: isFirst
                  ? [
                      AppColors.brand.withValues(alpha: 0.35),
                      AppColors.surfaceCard,
                    ]
                  : [
                      AppColors.surfaceRaised.withValues(alpha: 0.5),
                      AppColors.surfaceCard,
                    ],
            ),
            border: Border.all(
              color: isFirst
                  ? AppColors.brand.withValues(alpha: 0.25)
                  : AppColors.surfaceRaised,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              '$rank',
              style: AppTypography.mono(
                fontSize: isFirst ? 28 : 22,
                fontWeight: FontWeight.w800,
                color: isFirst
                    ? AppColors.brand.withValues(alpha: 0.55)
                    : AppColors.onSurfaceMuted.withValues(alpha: 0.45),
              ),
            ),
          ),
        ),
      ],
    );

    if (onTap == null) return content;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: content,
      ),
    );
  }
}

class RankingAvatarGroup extends StatelessWidget {
  const RankingAvatarGroup({
    super.key,
    required this.entry,
    this.size = RankingAvatarSizes.list,
  });

  final RankingListEntry entry;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (entry.isTeam) {
      return SizedBox(
        width: size + 16,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              child: _AvatarCircle(
                initials: entry.player1Initials ?? '?',
                color: entry.player1Color ?? AppColors.brand,
                imageUrl: entry.player1AvatarUrl,
                size: size,
              ),
            ),
            Positioned(
              left: size * 0.45,
              child: _AvatarCircle(
                initials: entry.player2Initials ?? '?',
                color: entry.player2Color ?? AppColors.win,
                imageUrl: entry.player2AvatarUrl,
                size: size,
                borderColor: AppColors.surfaceCard,
              ),
            ),
          ],
        ),
      );
    }

    return _AvatarCircle(
      initials: entry.initials ?? '?',
      color: entry.avatarColor ?? AppColors.brand,
      imageUrl: entry.avatarUrl,
      size: size,
    );
  }
}

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({
    required this.initials,
    required this.color,
    required this.size,
    this.imageUrl,
    this.borderColor,
  });

  final String initials;
  final Color color;
  final double size;
  final String? imageUrl;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final resolvedUrl = imageUrl?.trim();
    final hasPhoto = resolvedUrl != null && resolvedUrl.isNotEmpty;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: hasPhoto ? null : color.withValues(alpha: 0.22),
        border: Border.all(
          color: borderColor ?? color.withValues(alpha: 0.45),
          width: 2,
        ),
      ),
      child: ClipOval(
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: resolvedUrl,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => _InitialsAvatar(
                  initials: initials,
                  color: color,
                  size: size,
                ),
                placeholder: (_, __) => _InitialsAvatar(
                  initials: initials,
                  color: color,
                  size: size,
                ),
              )
            : _InitialsAvatar(
                initials: initials,
                color: color,
                size: size,
              ),
      ),
    );
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({
    required this.initials,
    required this.color,
    required this.size,
  });

  final String initials;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      color: color.withValues(alpha: 0.22),
      child: Text(
        initials,
        style: AppTypography.soraRegular(
          fontSize: size * 0.28,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}
