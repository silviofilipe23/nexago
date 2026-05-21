import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../data/my_tournament_registrations_repository.dart';
import '../../../athlete/domain/athlete_shell_providers.dart';
import '../../domain/tournament_discovery_models.dart';

class MyTournamentsHomeSection extends ConsumerWidget {
  const MyTournamentsHomeSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final regsAsync = ref.watch(myTournamentRegistrationsProvider);

    return regsAsync.when(
      data: (regs) {
        if (regs.isEmpty) return const SizedBox.shrink();
        final preview = regs.take(3).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'Meus torneios',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    ref.read(athleteShellTabIndexProvider.notifier).state =
                        athleteShellCompeteTabIndex;
                  },
                  child: const Text('Ver todos'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final r in preview) ...[
              _RegistrationRow(registration: r),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _RegistrationRow extends StatelessWidget {
  const _RegistrationRow({required this.registration});

  final MyTournamentRegistration registration;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    registration.tournamentName,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurface,
                    ),
                  ),
                  if (registration.dateLabel.isNotEmpty)
                    Text(
                      registration.dateLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: (registration.isPaid ? AppColors.win : AppColors.pending)
                    .withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                registration.statusLabel,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color:
                      registration.isPaid ? AppColors.win : AppColors.pending,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
