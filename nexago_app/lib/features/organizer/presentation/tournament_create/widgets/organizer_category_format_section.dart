import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_create/tournament_create_draft.dart';
import '../../../domain/tournament_create/tournament_create_logic.dart';
import 'organizer_form_widgets.dart';

/// Formato de chave, grupos e sets por categoria.
class OrganizerCategoryFormatSection extends StatelessWidget {
  const OrganizerCategoryFormatSection({
    super.key,
    required this.bracketSystem,
    required this.teamsPerGroup,
    required this.qualifiersPerGroup,
    required this.bestOf,
    required this.finalBestOf5,
    required this.onBracketSystemChanged,
    required this.onTeamsPerGroupChanged,
    required this.onQualifiersPerGroupChanged,
    required this.onBestOfChanged,
    required this.onFinalBestOf5Changed,
  });

  final TournamentBracketSystem bracketSystem;
  final int teamsPerGroup;
  final int qualifiersPerGroup;
  final TournamentBestOf bestOf;
  final bool finalBestOf5;
  final ValueChanged<TournamentBracketSystem> onBracketSystemChanged;
  final ValueChanged<int> onTeamsPerGroupChanged;
  final ValueChanged<int> onQualifiersPerGroupChanged;
  final ValueChanged<TournamentBestOf> onBestOfChanged;
  final ValueChanged<bool> onFinalBestOf5Changed;

  bool get _showGroups =>
      bracketSystem == TournamentBracketSystem.groupsThenKnockout ||
      bracketSystem == TournamentBracketSystem.groupsWithRepechage;

  @override
  Widget build(BuildContext context) {
    final hasUnsupportedSelection = !isBracketSystemSupported(bracketSystem);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OrganizerSectionLabel('SISTEMA DE DISPUTA'),
        const SizedBox(height: 12),
        if (hasUnsupportedSelection) ...[
          _UnsupportedFormatBanner(system: bracketSystem),
          const SizedBox(height: 12),
        ],
        for (final system in supportedBracketSystems) ...[
          OrganizerRadioOptionCard(
            title: bracketSystemLabel(system),
            subtitle: bracketSystemDescription(system),
            selected: bracketSystem == system,
            onTap: () => onBracketSystemChanged(system),
          ),
          const SizedBox(height: 10),
        ],
        if (_showGroups) ...[
          const SizedBox(height: 8),
          const OrganizerSectionLabel('CONFIGURAÇÃO DOS GRUPOS'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const OrganizerSectionLabel('DUPLAS POR GRUPO'),
                    const SizedBox(height: 8),
                    OrganizerNumericStepper(
                      valueLabel: '$teamsPerGroup',
                      minReached: teamsPerGroup <= 2,
                      onDecrement: () => onTeamsPerGroupChanged(teamsPerGroup - 1),
                      onIncrement: () => onTeamsPerGroupChanged(teamsPerGroup + 1),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const OrganizerSectionLabel('CLASSIFICAM'),
                    const SizedBox(height: 8),
                    OrganizerNumericStepper(
                      valueLabel: '$qualifiersPerGroup',
                      minReached: qualifiersPerGroup <= 1,
                      onDecrement: () =>
                          onQualifiersPerGroupChanged(qualifiersPerGroup - 1),
                      onIncrement: () =>
                          onQualifiersPerGroupChanged(qualifiersPerGroup + 1),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 20),
        const OrganizerSectionLabel('SETS'),
        const SizedBox(height: 8),
        const OrganizerSectionLabel('MELHOR DE'),
        const SizedBox(height: 8),
        OrganizerSegmentedControl(
          options: TournamentBestOf.values,
          selected: bestOf,
          labelBuilder: bestOfLabel,
          onSelected: onBestOfChanged,
        ),
        const SizedBox(height: 12),
        OrganizerToggleSettingRow(
          icon: Icons.flag_outlined,
          title: 'Final em MD5',
          subtitle: 'A decisão do título usa melhor de 5 sets.',
          value: finalBestOf5,
          onChanged: onFinalBestOf5Changed,
        ),
      ],
    );
  }
}

class _UnsupportedFormatBanner extends StatelessWidget {
  const _UnsupportedFormatBanner({required this.system});

  final TournamentBracketSystem system;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: AppColors.pending.withValues(alpha: 0.12),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Text(
        unsupportedBracketSystemHint(system),
        style: AppTypography.soraRegular(
          fontSize: 13,
          color: context.themeColors.onSurface,
        ),
      ),
    );
  }
}

