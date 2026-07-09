import 'package:flutter/material.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../domain/friendly_match_logic.dart';
import '../../domain/friendly_match_models.dart';

class FriendlyMatchDetailProfileCard extends StatelessWidget {
  const FriendlyMatchDetailProfileCard({
    super.key,
    required this.match,
    required this.uid,
  });

  final FriendlyMatch match;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final otherName = match.otherName(uid);
    final otherPhoto = match.otherPhotoUrl(uid);
    final initials = initialsFromDisplayName(otherName);
    final score = match.scoreAtSend;

    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.35),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              color: AppColors.brand,
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _DetailAvatar(
                      initials: initials,
                      photoUrl: otherPhoto,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            otherName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            friendlyMatchProfileSubtitle(match),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.mono(
                              fontSize: 12,
                              color: colors.onSurfaceMuted,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (score != null) ...[
                      const SizedBox(width: 8),
                      _CompatibilityBadge(score: score),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class FriendlyMatchDetailInfoCard extends StatelessWidget {
  const FriendlyMatchDetailInfoCard({
    super.key,
    required this.whenLabel,
    required this.locationLabel,
    this.alternativeWhenLabels = const [],
    this.counterMessage,
  });

  final String whenLabel;
  final String locationLabel;
  final List<String> alternativeWhenLabels;
  final String? counterMessage;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _InfoRow(
            icon: Icons.event_rounded,
            text: whenLabel,
          ),
          for (final alt in alternativeWhenLabels)
            _InfoRow(
              icon: Icons.more_time_rounded,
              text: 'Alternativa: $alt',
            ),
          _InfoRow(
            icon: Icons.place_outlined,
            text: locationLabel,
          ),
          if (counterMessage != null && counterMessage!.isNotEmpty)
            _InfoRow(
              icon: Icons.chat_bubble_outline_rounded,
              text: '“$counterMessage”',
            ),
        ],
      ),
    );
  }
}

class FriendlyMatchDetailTimeline extends StatelessWidget {
  const FriendlyMatchDetailTimeline({
    super.key,
    required this.steps,
  });

  final List<FriendlyMatchTimelineStep> steps;

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) return const SizedBox.shrink();

    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++)
            _TimelineRow(
              step: steps[i],
              isLast: i == steps.length - 1,
            ),
        ],
      ),
    );
  }
}

class FriendlyMatchDetailOutlineButton extends StatelessWidget {
  const FriendlyMatchDetailOutlineButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.brand : AppColors.brand;

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color.withValues(alpha: 0.55)),
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class _DetailAvatar extends StatelessWidget {
  const _DetailAvatar({
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

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.brand),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.step,
    required this.isLast,
  });

  final FriendlyMatchTimelineStep step;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final done = step.state == FriendlyMatchTimelineStepState.done;
    final lineColor = done ? AppColors.win : colors.outline.withValues(alpha: 0.2);
    final dotColor = done ? AppColors.win : AppColors.brand;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 28,
            child: Column(
              children: [
                _TimelineDot(done: done, color: dotColor),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      color: lineColor,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.title,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                  if (step.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      step.subtitle!,
                      style: AppTypography.mono(
                        fontSize: 11,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineDot extends StatelessWidget {
  const _TimelineDot({required this.done, required this.color});

  final bool done;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (done) {
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.check_rounded,
          size: 14,
          color: AppColors.black,
        ),
      );
    }

    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2),
      ),
      child: Center(
        child: Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}
