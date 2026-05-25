import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../data/my_tournament_registrations_repository.dart';
import '../../../athlete/domain/athlete_shell_providers.dart';
import '../../../athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import '../../domain/tournament_discovery_models.dart';

class MyTournamentsHomeSection extends ConsumerWidget {
  const MyTournamentsHomeSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final regsAsync = ref.watch(myTournamentRegistrationsProvider);

    return regsAsync.when(
      data: (regs) {
        if (regs.isEmpty) return const SizedBox.shrink();
        final preview = regs.take(3).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AthleteHomeSectionHeader(
              title: 'Meus torneios',
              trailingLabel: 'VER TODOS',
              onTrailingTap: () {
                ref.read(athleteShellTabIndexProvider.notifier).state =
                    athleteShellCompeteTabIndex;
              },
            ),
            const SizedBox(height: 10),
            for (final r in preview) ...[
              _RegistrationRow(registration: r),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class _RegistrationRow extends StatelessWidget {
  const _RegistrationRow({required this.registration});

  final MyTournamentRegistration registration;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final badgeColor =
        registration.isPaid ? AppColors.pending : AppColors.pending;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.surfaceRaised,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.emoji_events_outlined,
                color: AppColors.onSurfaceMuted,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    registration.tournamentName,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (registration.dateLabel.isNotEmpty)
                    Text(
                      registration.dateLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: badgeColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: badgeColor.withValues(alpha: 0.35)),
              ),
              child: Text(
                registration.statusLabel.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: badgeColor,
                  fontSize: 9,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
