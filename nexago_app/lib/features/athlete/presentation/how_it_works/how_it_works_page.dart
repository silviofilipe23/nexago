import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_icon_square_button.dart';
import '../../domain/gamification_providers.dart';
import '../../domain/how_it_works/how_it_works_rules.dart';
import '../../domain/sand_rank/sand_rank_providers.dart';
import 'widgets/how_it_works_elo_tab.dart';
import 'widgets/how_it_works_level_tab.dart';
import 'widgets/how_it_works_ranking_tab.dart';

/// "Como funciona": separa as três medidas do atleta, uma por aba — Nível
/// (com quem você joga), Elo e XP (o quanto você joga) e Ranking (como vai
/// em torneios). Cada aba abre com o valor atual do próprio atleta.
class HowItWorksPage extends ConsumerStatefulWidget {
  const HowItWorksPage({
    super.key,
    this.initialTab = HowItWorksTab.level,
    this.origin,
  });

  final HowItWorksTab initialTab;

  /// Aba cuja tela abriu esta (Esportes e níveis, Trilha de Elos, Ranking):
  /// o atalho para aquela tela some, porque seria empilhar a mesma tela.
  final HowItWorksTab? origin;

  @override
  ConsumerState<HowItWorksPage> createState() => _HowItWorksPageState();
}

class _HowItWorksPageState extends ConsumerState<HowItWorksPage> {
  late HowItWorksTab _tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final eloEnabled = ref.watch(sandRankEnabledProvider).valueOrNull ?? false;
    // Assina o XP já na abertura: a aba Elo não pisca "0 XP" ao ser escolhida.
    ref.watch(gamificationSummaryProvider);
    final origin = widget.origin;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.sm,
                AppSpacing.screenH,
                0,
              ),
              child: Row(
                children: [
                  NexaIconSquareButton(
                    icon: Icons.arrow_back_rounded,
                    size: 42,
                    tooltip: 'Voltar',
                    onTap: () => context.canPop()
                        ? context.pop()
                        : context.go(AppRoutes.discover),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        'Como funciona',
                        style: AppTypography.soraRegular(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                12,
                AppSpacing.screenH,
                0,
              ),
              child: Text(
                'Três medidas, cada uma com um papel diferente na sua '
                'evolução.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontSize: 13,
                      color: colors.onSurfaceMuted,
                    ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                14,
                AppSpacing.screenH,
                14,
              ),
              child: _TabSelector(
                selected: _tab,
                eloLabel: eloEnabled ? HowItWorksTab.elo.label : 'XP',
                onSelect: (tab) => setState(() => _tab = tab),
              ),
            ),
            Divider(
              height: 1,
              thickness: 1,
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            Expanded(
              child: ListView(
                // Uma chave por aba: trocar de aba volta a rolagem ao topo.
                key: ValueKey(_tab),
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  18,
                  AppSpacing.screenH,
                  MediaQuery.paddingOf(context).bottom + 40,
                ),
                children: [
                  switch (_tab) {
                    HowItWorksTab.level => HowItWorksLevelTab(
                        openedFromLevels: origin == HowItWorksTab.level,
                      ),
                    HowItWorksTab.elo => HowItWorksEloTab(
                        eloEnabled: eloEnabled,
                        showTrackLink: origin != HowItWorksTab.elo,
                      ),
                    HowItWorksTab.ranking => HowItWorksRankingTab(
                        showRankingLink: origin != HowItWorksTab.ranking,
                      ),
                  },
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabSelector extends StatelessWidget {
  const _TabSelector({
    required this.selected,
    required this.eloLabel,
    required this.onSelect,
  });

  final HowItWorksTab selected;
  final String eloLabel;
  final ValueChanged<HowItWorksTab> onSelect;

  @override
  Widget build(BuildContext context) {
    // IntrinsicHeight: as três abas ficam da altura da mais alta (a pergunta
    // quebra em duas linhas em umas e não em outras).
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final tab in HowItWorksTab.values) ...[
            if (tab != HowItWorksTab.values.first) const SizedBox(width: 8),
            Expanded(
              child: _TabButton(
                label: tab == HowItWorksTab.elo ? eloLabel : tab.label,
                question: tab.question,
                selected: tab == selected,
                onTap: () => onSelect(tab),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.question,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String question;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.1)
            : colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            constraints: const BoxConstraints(minHeight: 64),
            padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected
                    ? AppColors.brand.withValues(alpha: 0.45)
                    : colors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: selected ? colors.brandText : colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  question,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                    height: 1.3,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
