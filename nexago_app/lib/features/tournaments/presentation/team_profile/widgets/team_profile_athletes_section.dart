import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/domain/athlete_public_profile_models.dart';
import '../../../../athlete/domain/athlete_public_profile_providers.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_profile/team_public_profile_logic.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileAthletesSection extends ConsumerWidget {
  const TeamProfileAthletesSection({super.key, required this.profile});

  final TeamPublicProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = profile.members;
    if (members.isEmpty) return const SizedBox.shrink();

    final gender = teamProfileGenderLabel(profile.loadedProfiles);
    final showCaptainBadge = profile.isLargeRoster;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'ATLETAS',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${members.length}${gender.isNotEmpty ? ' · $gender' : ''}',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < members.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _AthleteCard(
              member: members[i],
              showCaptainBadge: showCaptainBadge,
            ),
          ],
        ],
      ),
    );
  }
}

class _AthleteCard extends ConsumerWidget {
  const _AthleteCard({required this.member, required this.showCaptainBadge});

  final TeamMemberEntry member;
  final bool showCaptainBadge;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = member.profile;
    final rankingAsync = ref.watch(athletePublicRankingProvider(member.uid));
    final rankLabel = rankingAsync.maybeWhen(
      data: (snapshot) => snapshot.hasRank ? '#${snapshot.rank}' : '—',
      orElse: () => '—',
    );
    final name = profile != null ? athleteDisplayName(profile) : 'Atleta';
    final ageLabel = athleteAgeCategoryLabel(profile?.birthDate);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': member.uid},
        ),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Row(
            children: [
              AthleteProfileAvatar(
                size: 48,
                initials: profile != null ? athleteInitials(profile) : '?',
                imageUrl: profile?.avatarUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.soraRegular(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                        ),
                        if (showCaptainBadge && member.isCaptain) ...[
                          const SizedBox(width: 6),
                          const _CaptainBadge(),
                        ],
                      ],
                    ),
                    if (ageLabel.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        ageLabel,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'RANK',
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                  Text(
                    rankLabel,
                    style: AppTypography.soraRegular(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: member.isCaptain
                          ? AppColors.brand
                          : context.themeColors.onSurface,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CaptainBadge extends StatelessWidget {
  const _CaptainBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Text(
        'CAPITÃO',
        style: AppTypography.mono(
          fontSize: 8,
          fontWeight: FontWeight.w700,
          color: AppColors.brand,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
