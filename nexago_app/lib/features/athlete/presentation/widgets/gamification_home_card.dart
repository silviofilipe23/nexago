import 'package:flutter/material.dart';

import '../../domain/gamification_models.dart';

class GamificationHomeCard extends StatelessWidget {
  const GamificationHomeCard({
    super.key,
    required this.summary,
    required this.dailyMissions,
    required this.nudge,
  });

  final GamificationSummary summary;
  final DailyMissionBundle? dailyMissions;
  final String? nudge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final missionCount = dailyMissions?.missions.length ?? 0;
    final missionDone =
        dailyMissions?.missions.where((m) => m.completed).length ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withValues(alpha: 0.06),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sua energia de jogo',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 14),
          _InfoLine(
              label: '🔥 Streak', value: '${summary.streak} dias seguidos'),
          const SizedBox(height: 8),
          _InfoLine(
            label: '⭐ XP',
            value:
                '${summary.xpInCurrentLevel} / 100 (${summary.xpForNextLevel} para subir)',
          ),
          const SizedBox(height: 8),
          _InfoLine(label: '🏆 Nivel', value: 'Nivel ${summary.level}'),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: summary.progressToNextLevel,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
            ),
          ),
          if (missionCount > 0) ...[
            const SizedBox(height: 14),
            Text(
              'Missões de hoje: $missionDone/$missionCount',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (nudge != null && nudge!.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                nudge!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF8D6E00),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        SizedBox(
          width: 94,
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: theme.textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}
