import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/compete_hub_models.dart';
import '../../../domain/compete_hub_providers.dart';
import 'compete_hub_section_header.dart';

class CompeteHubTeamsSection extends ConsumerWidget {
  const CompeteHubTeamsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final team = ref.watch(competeHubTeamPreviewProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Equipes',
          actionLabel: 'VER DUPLA',
          onActionTap: () => showAppSnackBar(context, 'Em breve.'),
        ),
        const SizedBox(height: 10),
        _TeamCard(team: team),
      ],
    );
  }
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.team});

  final CompeteHubTeamPreview team;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => showAppSnackBar(context, 'Em breve.'),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 72,
                height: 44,
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    Positioned(
                      left: 0,
                      child: _TeamAvatar(
                        initials: 'V',
                        color: AppColors.brand,
                      ),
                    ),
                    Positioned(
                      right: 0,
                      child: _TeamAvatar(
                        initials: team.partnerInitials,
                        color: team.partnerColor,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Você & ${team.partnerName}',
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${team.categoryLabel} · ${team.monthsTogether} meses juntos',
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${team.winRatePercent}%',
                    style: AppTypography.soraRegular(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppColors.win,
                    ),
                  ),
                  Text(
                    '${team.wins}V / ${team.losses}D',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.6),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TeamAvatar extends StatelessWidget {
  const _TeamAvatar({required this.initials, required this.color});

  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.onSurface, width: 2),
      ),
      child: Text(
        initials,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}
