import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/domain/athlete_display_name.dart';
import '../../../../athlete/domain/athlete_profile.dart';
import '../../../../athlete/domain/athlete_public_profile_models.dart';
import '../../../../athlete/domain/athlete_public_profile_providers.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileAthletesSection extends ConsumerWidget {
  const TeamProfileAthletesSection({super.key, required this.profile});

  final TeamPublicProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final players = <_PlayerSlot>[
      if (profile.player1 != null)
        _PlayerSlot(profile: profile.player1!, isCaptain: true),
      if (profile.player2 != null) _PlayerSlot(profile: profile.player2!),
    ];

    if (players.isEmpty) return const SizedBox.shrink();

    final gender = athleteGenderShortLabel(
      profile.player1?.gender ?? profile.player2?.gender,
    );

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
                '${players.length}${gender.isNotEmpty ? ' · $gender' : ''}',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < players.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _AthleteCard(slot: players[i]),
          ],
        ],
      ),
    );
  }
}

class _PlayerSlot {
  const _PlayerSlot({required this.profile, this.isCaptain = false});

  final AthleteProfile profile;
  final bool isCaptain;
}

class _AthleteCard extends ConsumerWidget {
  const _AthleteCard({required this.slot});

  final _PlayerSlot slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = slot.profile;
    final rankingAsync = ref.watch(athletePublicRankingProvider(profile.id));
    final rankLabel = rankingAsync.maybeWhen(
      data: (snapshot) => snapshot.hasRank ? '#${snapshot.rank}' : '—',
      orElse: () => '—',
    );
    final name = athleteDisplayName(profile);
    final ageLabel = athleteAgeCategoryLabel(profile.birthDate);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.athleteProfile,
          queryParameters: {'userId': profile.id},
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
                initials: athleteInitials(profile),
                imageUrl: profile.avatarUrl,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
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
                      color: slot.isCaptain
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
