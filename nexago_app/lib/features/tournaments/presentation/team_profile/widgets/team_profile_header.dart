import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_profile/team_public_profile_logic.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileHeader extends StatelessWidget {
  const TeamProfileHeader({
    super.key,
    required this.profile,
    required this.onBack,
  });

  static const coverHeight = 220.0;
  static const avatarSize = 96.0;
  static const avatarOverlap = 48.0;

  final TeamPublicProfile profile;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final displayName = teamProfileDisplayName(
      team: profile.team,
      player1: profile.player1,
      player2: profile.player2,
    );
    final sport = teamProfileSportLabel(profile.player1, profile.player2);
    // final together = formatTeamTogetherLabel(profile.team.createdAt);
    final tags = teamProfileTagLabels(profile.player1, profile.player2);
    final subtitleParts = <String>[sport];
    // if (together.isNotEmpty) subtitleParts.add('juntos há $together');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.topCenter,
          children: [
            const SizedBox(
              height: coverHeight,
              width: double.infinity,
              child: _TeamCoverBackground(),
            ),
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                child: Row(
                  children: [
                    _IconButton(onTap: onBack, icon: Icons.arrow_back_rounded),
                  ],
                ),
              ),
            ),
            if (profile.ranking.hasRank)
              Positioned(
                top: MediaQuery.paddingOf(context).top + 56,
                right: 20,
                child: _RankingBadge(rank: profile.ranking.rank!),
              ),
            Positioned(
              left: 0,
              right: 0,
              top: coverHeight - avatarOverlap,
              child: Center(child: _DualTeamAvatars(profile: profile)),
            ),
          ],
        ),
        SizedBox(height: avatarSize - avatarOverlap + 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              Text(
                displayName,
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitleParts.join(' · '),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  alignment: WrapAlignment.center,
                  children: [for (final tag in tags) _TagChip(label: tag)],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DualTeamAvatars extends StatelessWidget {
  const _DualTeamAvatars({required this.profile});

  final TeamPublicProfile profile;

  @override
  Widget build(BuildContext context) {
    final p1 = profile.player1;
    final p2 = profile.player2;
    final p1Initials = p1 != null ? athleteInitials(p1) : '?';
    final p2Initials = p2 != null ? athleteInitials(p2) : '?';

    return SizedBox(
      width: 140,
      height: TeamProfileHeader.avatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 8,
            child: AthleteProfileAvatar(
              size: TeamProfileHeader.avatarSize * 0.82,
              initials: p1Initials,
              imageUrl: p1?.avatarUrl,
            ),
          ),
          if (!profile.isLookingForPartner && p2 != null)
            Positioned(
              right: 8,
              child: AthleteProfileAvatar(
                size: TeamProfileHeader.avatarSize * 0.82,
                initials: p2Initials,
                imageUrl: p2.avatarUrl,
              ),
            ),
        ],
      ),
    );
  }
}

class _TeamCoverBackground extends StatelessWidget {
  const _TeamCoverBackground();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.45),
            context.themeColors.canvas,
            AppColors.brand.withValues(alpha: 0.12),
          ],
        ),
      ),
      child: CustomPaint(
        painter: _CoverPatternPainter(
          color: AppColors.brand.withValues(alpha: 0.08),
        ),
      ),
    );
  }
}

class _RankingBadge extends StatelessWidget {
  const _RankingBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            'RANKING DUPLAS BR',
            style: AppTypography.mono(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
          ),
          Text(
            '#$rank',
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  const _IconButton({required this.onTap, required this.icon});

  final VoidCallback onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard.withValues(alpha: 0.75),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 20, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _CoverPatternPainter extends CustomPainter {
  const _CoverPatternPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    for (var i = 0; i < 8; i++) {
      canvas.drawCircle(
        Offset(size.width * 0.15 + size.width * 0.1 * i, size.height * 0.35),
        18 + i * 2,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
