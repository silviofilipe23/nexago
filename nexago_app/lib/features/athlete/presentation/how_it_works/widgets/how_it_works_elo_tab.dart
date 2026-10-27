import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/gamification_providers.dart';
import '../../../domain/how_it_works/how_it_works_rules.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_providers.dart';
import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';
import '../../sand_rank/widgets/sand_rank_emblem.dart';
import 'how_it_works_parts.dart';

/// Aba "Elo e XP": o elo atual com a barra até o próximo, quanto XP vale cada
/// ação e a trilha. Com a flag do elo desligada vira só "XP" (total + ações).
class HowItWorksEloTab extends ConsumerWidget {
  const HowItWorksEloTab({
    super.key,
    required this.eloEnabled,
    this.showTrackLink = true,
  });

  final bool eloEnabled;
  final bool showTrackLink;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final xp = ref.watch(gamificationSummaryProvider).valueOrNull?.xp ?? 0;
    final progress = ref.watch(sandRankProgressProvider);
    final rules = howItWorksXpRules();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (eloEnabled)
          _EloHero(progress: progress, xp: xp)
        else
          _XpHero(xp: xp),
        const SizedBox(height: 20),
        HowItWorksSection(
          title: 'Como ganhar XP',
          child: HowItWorksCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            child: Column(
              children: [
                for (final rule in rules)
                  HowItWorksValueRow(
                    title: rule.title,
                    subtitle: rule.subtitle,
                    value: rule.value,
                    valueColor: context.themeColors.brandText,
                    last: rule == rules.last,
                  ),
              ],
            ),
          ),
        ),
        if (eloEnabled) ...[
          const SizedBox(height: 20),
          HowItWorksSection(
            title: 'A trilha',
            child: _TrackCard(current: progress.current),
          ),
        ],
        const SizedBox(height: 20),
        HowItWorksNote(
          eloEnabled
              ? 'O elo nunca cai e não muda seu nível nem sua categoria. Ele '
                  'mostra o quanto você joga.'
              : 'XP mostra o quanto você joga. Ele não muda seu nível nem sua '
                  'categoria.',
        ),
        if (eloEnabled && showTrackLink) ...[
          const SizedBox(height: 20),
          HowItWorksLinkButton(
            label: 'Ver minha trilha de elos',
            onPressed: () => context.pushNamed(AppRouteNames.athleteRankTrack),
          ),
        ],
      ],
    );
  }
}

String _xpLabel(int xp) =>
    '${NumberFormat.decimalPattern('pt_BR').format(xp)} XP';

class _EloHero extends StatelessWidget {
  const _EloHero({required this.progress, required this.xp});

  final SandRankProgress progress;
  final int xp;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final current = progress.current;
    final next = progress.next;
    final color = sandRankColor(current.rankCode);

    return HowItWorksCard(
      tint: color,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SandRankStepEmblem(
                  step: current, size: SandRankEmblemSize.medium),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Cor do elo só no emblema, na barra e no cartão: em
                    // texto pequeno azul/roxo/turquesa não passam 4,5:1.
                    const HowItWorksKicker('Seu elo'),
                    const SizedBox(height: 2),
                    Text(
                      sandRankLabel(current),
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                _xpLabel(xp),
                style: AppTypography.mono(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: progress.progress,
              backgroundColor: colors.onSurfaceMuted.withValues(alpha: 0.15),
              color: color,
            ),
          ),
          const SizedBox(height: 8),
          Text.rich(
            next == null
                ? const TextSpan(text: 'Você é uma Lenda: o topo da trilha.')
                : TextSpan(
                    children: [
                      const TextSpan(text: 'Faltam '),
                      TextSpan(
                        text: _xpLabel(progress.xpToNext),
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: colors.onSurface,
                        ),
                      ),
                      TextSpan(text: ' pra ${sandRankLabel(next)}'),
                    ],
                  ),
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _XpHero extends StatelessWidget {
  const _XpHero({required this.xp});

  final int xp;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return HowItWorksCard(
      tint: AppColors.brand,
      child: Row(
        children: [
          Icon(Icons.bolt_rounded, color: colors.brandText, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: HowItWorksKicker('Seu XP', color: colors.brandText),
          ),
          Text(
            _xpLabel(xp),
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _TrackCard extends StatelessWidget {
  const _TrackCard({required this.current});

  final SandRankStep current;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final families = sandRankFamilies();

    return HowItWorksCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final family in families)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Column(
                      children: [
                        SandRankEmblem(
                          rankCode: family.rankCode,
                          division: family.division,
                          size: SandRankEmblemSize.badge,
                          locked: family.trackIndex > current.trackIndex,
                        ),
                        const SizedBox(height: 8),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            family.rankName.toUpperCase(),
                            style: AppTypography.mono(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.4,
                              color: family.rankCode == current.rankCode
                                  ? colors.onSurface
                                  : colors.onSurfaceMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '${families.length - 1} elos com três etapas cada (',
                ),
                TextSpan(
                  text: 'III, II e I',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const TextSpan(
                  text:
                      ') e a Lenda no topo. Cada etapa libera emblema, moldura '
                      'ou título pro seu perfil.',
                ),
              ],
            ),
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
