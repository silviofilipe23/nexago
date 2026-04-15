import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/gamification_providers.dart';
import 'widgets/gamification_home_card.dart';

/// Aba Início do atleta com card de gamificação.
class AthleteHomePage extends ConsumerWidget {
  const AthleteHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final summaryAsync = ref.watch(gamificationSummaryProvider);
    final missionsAsync = ref.watch(dailyMissionsProvider);
    final nudge = ref.watch(gamificationNudgeProvider);

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) => Center(
          child: Text(
            'Nao foi possivel carregar sua evolucao.',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ),
        data: (summary) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            children: [
              Text(
                'Início',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Seu ritmo hoje define seu próximo nível.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 16),
              GamificationHomeCard(
                summary: summary,
                dailyMissions: missionsAsync.valueOrNull,
                nudge: nudge,
              ),
            ],
          );
        },
      ),
    );
  }
}
