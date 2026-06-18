import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/compete_hub_models.dart';
import '../../../domain/compete_hub_providers.dart';
import 'compete_hub_section_header.dart';

const _hubAthletesRowHeight = 120.0;
const _hubAthleteAvatarSize = 64.0;
const _hubAthleteChipWidth = 72.0;

class CompeteHubAthletesSection extends ConsumerWidget {
  const CompeteHubAthletesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athletesAsync = ref.watch(competeHubAthletesPreviewProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Atletas',
          actionLabel: 'DESCOBRIR',
          onActionTap: () => context.pushNamed(AppRouteNames.athleteDiscover),
        ),
        SizedBox(height: 10),
        athletesAsync.when(
          loading: () => const _AthletesLoading(),
          error: (_, __) =>
              const _AthletesMessage('Não foi possível carregar os atletas.'),
          data: (athletes) {
            if (athletes.isEmpty) {
              return const _AthletesMessage(
                'Nenhum atleta para descobrir ainda.',
              );
            }
            return SizedBox(
              height: _hubAthletesRowHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: athletes.length,
                separatorBuilder: (_, __) => SizedBox(width: 14),
                itemBuilder: (context, index) {
                  return _AthleteChip(athlete: athletes[index]);
                },
              ),
            );
          },
        ),
      ],
    );
  }
}

class _AthletesLoading extends StatelessWidget {
  const _AthletesLoading();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _hubAthletesRowHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: 5,
        separatorBuilder: (_, __) => SizedBox(width: 14),
        itemBuilder: (_, __) => const _AthleteChipSkeleton(),
      ),
    );
  }
}

class _AthleteChipSkeleton extends StatelessWidget {
  const _AthleteChipSkeleton();

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);
    return SizedBox(
      width: _hubAthleteChipWidth,
      child: Column(
        children: [
          Container(
            width: _hubAthleteAvatarSize,
            height: _hubAthleteAvatarSize,
            decoration: BoxDecoration(color: muted, shape: BoxShape.circle),
          ),
          SizedBox(height: 8),
          Container(
            width: 48,
            height: 10,
            decoration: BoxDecoration(
              color: muted,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          SizedBox(height: 6),
          Container(
            width: 36,
            height: 8,
            decoration: BoxDecoration(
              color: muted,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ],
      ),
    );
  }
}

class _AthletesMessage extends StatelessWidget {
  const _AthletesMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(
        message,
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}

class _AthleteChip extends StatelessWidget {
  const _AthleteChip({required this.athlete});

  final CompeteHubAthletePreview athlete;

  void _openProfile(BuildContext context) {
    final userId = athlete.userId?.trim();
    if (userId == null || userId.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteProfile,
      queryParameters: {'userId': userId},
    );
  }

  @override
  Widget build(BuildContext context) {
    final userId = athlete.userId?.trim();
    final canOpenProfile = userId != null && userId.isNotEmpty;

    return SizedBox(
      width: _hubAthleteChipWidth,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: canOpenProfile ? () => _openProfile(context) : null,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AthleteProfileAvatar(
                  size: _hubAthleteAvatarSize,
                  initials: athlete.initials,
                  imageUrl: athlete.avatarUrl,
                ),
                if (athlete.isOnline)
                  Positioned(
                    right: 2,
                    top: 2,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: AppColors.win,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: context.themeColors.canvas,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            SizedBox(height: 6),
            Text(
              athlete.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                height: 1.1,
                color: context.themeColors.onSurface,
              ),
            ),
            Text(
              athlete.categoryLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 8,
                fontWeight: FontWeight.w500,
                height: 1.1,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
