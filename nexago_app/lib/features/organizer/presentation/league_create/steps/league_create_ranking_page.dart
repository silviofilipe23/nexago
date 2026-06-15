import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/ranking/domain/ranking_constants.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_logic.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

const _rankingTableOptions = ['state_circuit', 'nexago_standalone'];

class LeagueCreateRankingPage extends ConsumerStatefulWidget {
  const LeagueCreateRankingPage({super.key});

  @override
  ConsumerState<LeagueCreateRankingPage> createState() =>
      _LeagueCreateRankingPageState();
}

class _LeagueCreateRankingPageState
    extends ConsumerState<LeagueCreateRankingPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncLeagueWizardStep(ref, LeagueCreateStep.ranking);
    });
  }

  Future<void> _handleClose() => handleLeagueWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue =
        ref.watch(leagueCreateCanContinueProvider(LeagueCreateStep.ranking));
    final notifier = ref.read(leagueCreateWizardProvider.notifier);
    final points = effectiveRankingPoints(draft);

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.ranking,
      onBack: () {
        syncLeagueWizardStep(ref, LeagueCreateStep.categories);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OrganizerSectionLabel('COMO SOMAM OS PONTOS'),
          const SizedBox(height: 8),
          DropdownButtonFormField<LeagueCountingStagesMode>(
            value: draft.countingStagesMode,
            decoration: _fieldDecoration(context),
            items: [
              for (final mode in LeagueCountingStagesMode.values)
                DropdownMenuItem(
                  value: mode,
                  child: Text(countingStagesModeLabel(mode)),
                ),
            ],
            onChanged: (value) {
              if (value != null) notifier.setCountingStagesMode(value);
            },
          ),
          const SizedBox(height: 6),
          Text(
            countingStagesModeDescription(draft.countingStagesMode),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('TABELA DE PONTOS'),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: draft.rankingTableId,
            decoration: _fieldDecoration(context),
            items: [
              for (final id in _rankingTableOptions)
                DropdownMenuItem(
                  value: id,
                  child: Text(leagueRankingTableLabel(id)),
                ),
            ],
            onChanged: (value) {
              if (value != null) notifier.setRankingTableId(value);
            },
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('PONTOS POR COLOCAÇÃO'),
          const SizedBox(height: 12),
          _PointsPreviewGrid(
            points: points,
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('GRANDE FINAL'),
          const SizedBox(height: 8),
          OrganizerNumericStepper(
            valueLabel: '${draft.grandFinalSpots} vagas',
            minReached: draft.grandFinalSpots <= 4,
            onDecrement: () =>
                notifier.setGrandFinalSpots(draft.grandFinalSpots - 2),
            onIncrement: () =>
                notifier.setGrandFinalSpots(draft.grandFinalSpots + 2),
          ),
          const SizedBox(height: 16),
          OrganizerToggleSettingRow(
            icon: Icons.star_outline_rounded,
            title: 'Wildcards',
            subtitle: 'Vagas extras fora do ranking automático.',
            value: draft.wildcardEnabled,
            onChanged: notifier.setWildcardEnabled,
            nested: draft.wildcardEnabled
                ? [
                    OrganizerNumericStepper(
                      valueLabel: '${draft.wildcardSpots} wildcards',
                      minReached: draft.wildcardSpots <= 1,
                      onDecrement: () =>
                          notifier.setWildcardSpots(draft.wildcardSpots - 1),
                      onIncrement: () =>
                          notifier.setWildcardSpots(draft.wildcardSpots + 1),
                    ),
                  ]
                : null,
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextLeagueCreateStep(
          context,
          ref,
          LeagueCreateStep.ranking,
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(BuildContext context) {
    return InputDecoration(
      filled: true,
      fillColor: context.themeColors.surfaceCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
        ),
      ),
    );
  }
}

class _PointsPreviewGrid extends StatelessWidget {
  const _PointsPreviewGrid({
    required this.points,
  });

  final Map<String, int> points;

  @override
  Widget build(BuildContext context) {
    final entries = <({String label, int value})>[
      for (var place = 1; place <= 4; place++)
        (
          label: '${place}º',
          value: getPointsForPlaceFromLeagueConfig(place, points),
        ),
      (label: 'Quartas', value: points['quarters'] ?? 0),
      (label: 'Grupos', value: points['groups'] ?? 0),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final entry in entries)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width - 56) / 3,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color:
                      context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.label,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${entry.value} pts',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.brand,
                        ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
