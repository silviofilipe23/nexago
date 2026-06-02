import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/compete_hub_models.dart';
import '../../../domain/compete_hub_providers.dart';
import 'compete_hub_section_header.dart';

class CompeteHubAthletesSection extends ConsumerWidget {
  const CompeteHubAthletesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athletes = ref.watch(competeHubAthletesPreviewProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Atletas',
          actionLabel: 'DESCOBRIR',
          onActionTap: () =>
              context.pushNamed(AppRouteNames.athleteDiscover),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: athletes.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, index) {
              return _AthleteChip(athlete: athletes[index]);
            },
          ),
        ),
      ],
    );
  }
}

class _AthleteChip extends StatelessWidget {
  const _AthleteChip({required this.athlete});

  final CompeteHubAthletePreview athlete;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      child: Column(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: athlete.avatarColor.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
                  ),
                ),
                child: Text(
                  athlete.initials,
                  style: AppTypography.soraRegular(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: athlete.avatarColor,
                  ),
                ),
              ),
              if (athlete.isOnline)
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: AppColors.win,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppColors.canvas,
                        width: 2,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            athlete.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          Text(
            athlete.categoryLabel,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
