import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_create/king_of_court_plan.dart';
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
    required this.onBracketSystemChanged,
    required this.onTeamsPerGroupChanged,
    required this.onQualifiersPerGroupChanged,
    this.spots = 16,
    this.kocTeamsPerCourt = kocDefaultTeamsPerCourt,
    this.kocQualifiersPerRound = kocDefaultQualifiersPerRound,
    this.kocRoundDurationSec = kocDefaultRoundDurationSec,
    this.onKocTeamsPerCourtChanged,
    this.onKocQualifiersPerRoundChanged,
    this.onKocRoundDurationSecChanged,
  });

  final TournamentBracketSystem bracketSystem;
  final int teamsPerGroup;
  final int qualifiersPerGroup;
  final ValueChanged<TournamentBracketSystem> onBracketSystemChanged;
  final ValueChanged<int> onTeamsPerGroupChanged;
  final ValueChanged<int> onQualifiersPerGroupChanged;

  /// Capacidade da categoria — base da estimativa de tempo de quadra do KOTC.
  final int spots;
  final int kocTeamsPerCourt;
  final int kocQualifiersPerRound;
  final int kocRoundDurationSec;
  final ValueChanged<int>? onKocTeamsPerCourtChanged;
  final ValueChanged<int>? onKocQualifiersPerRoundChanged;
  final ValueChanged<int>? onKocRoundDurationSecChanged;

  bool get _showGroups =>
      bracketSystem == TournamentBracketSystem.groupsThenKnockout ||
      bracketSystem == TournamentBracketSystem.groupsWithRepechage;

  bool get _isKingOfCourt =>
      bracketSystem == TournamentBracketSystem.kingOfCourt;

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
        if (_isKingOfCourt) ...[
          const SizedBox(height: 8),
          _KingOfCourtConfig(
            spots: spots,
            teamsPerCourt: kocTeamsPerCourt,
            qualifiersPerRound: kocQualifiersPerRound,
            roundDurationSec: kocRoundDurationSec,
            onTeamsPerCourtChanged: onKocTeamsPerCourtChanged,
            onQualifiersPerRoundChanged: onKocQualifiersPerRoundChanged,
            onRoundDurationSecChanged: onKocRoundDurationSecChanged,
          ),
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
        if (!_isKingOfCourt) ...[
          const SizedBox(height: 20),
          const OrganizerSectionLabel('SETS'),
          const SizedBox(height: 8),
          const OrganizerInfoRow(
            icon: Icons.sports_volleyball_outlined,
            title: 'Melhor de 3 sets',
            subtitle: 'Sets até 21; 3º set decisivo até 15 (vantagem de 2).',
          ),
        ],
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


/// Configuração do King of the Court.
///
/// O número que decide a publicação não é nenhum dos steppers: é o **tempo
/// total de quadra** logo abaixo deles. Duração de rodada isolada não responde
/// "cabe na minha reserva?"; o total responde, e responde antes do dia.
class _KingOfCourtConfig extends StatelessWidget {
  const _KingOfCourtConfig({
    required this.spots,
    required this.teamsPerCourt,
    required this.qualifiersPerRound,
    required this.roundDurationSec,
    required this.onTeamsPerCourtChanged,
    required this.onQualifiersPerRoundChanged,
    required this.onRoundDurationSecChanged,
  });

  final int spots;
  final int teamsPerCourt;
  final int qualifiersPerRound;
  final int roundDurationSec;
  final ValueChanged<int>? onTeamsPerCourtChanged;
  final ValueChanged<int>? onQualifiersPerRoundChanged;
  final ValueChanged<int>? onRoundDurationSecChanged;

  static const _durationStepSec = 300;

  @override
  Widget build(BuildContext context) {
    final schedule = kingOfCourtSchedule(
      teamCount: spots,
      teamsPerCourt: teamsPerCourt,
      qualifiersPerRound: qualifiersPerRound,
      roundDurationSec: roundDurationSec,
    );
    final minutes = roundDurationSec ~/ 60;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OrganizerSectionLabel('CONFIGURAÇÃO DAS RODADAS'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StepperField(
                label: 'DUPLAS POR QUADRA',
                valueLabel: '$teamsPerCourt',
                minReached: teamsPerCourt <= kocMinTeamsPerRound,
                maxReached: teamsPerCourt >= kocMaxTeamsPerRound,
                onDecrement: () => onTeamsPerCourtChanged?.call(
                  teamsPerCourt - 1,
                ),
                onIncrement: () => onTeamsPerCourtChanged?.call(
                  teamsPerCourt + 1,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StepperField(
                label: 'CLASSIFICAM',
                valueLabel: '$qualifiersPerRound',
                minReached: qualifiersPerRound <= 1,
                maxReached: qualifiersPerRound >= teamsPerCourt - 1,
                onDecrement: () => onQualifiersPerRoundChanged?.call(
                  qualifiersPerRound - 1,
                ),
                onIncrement: () => onQualifiersPerRoundChanged?.call(
                  qualifiersPerRound + 1,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _StepperField(
          label: 'DURAÇÃO DA RODADA',
          valueLabel: '$minutes min',
          minReached: roundDurationSec <= kocMinRoundDurationSec,
          maxReached: roundDurationSec >= kocMaxRoundDurationSec,
          onDecrement: () => onRoundDurationSecChanged?.call(
            roundDurationSec - _durationStepSec,
          ),
          onIncrement: () => onRoundDurationSecChanged?.call(
            roundDurationSec + _durationStepSec,
          ),
        ),
        const SizedBox(height: 16),
        _KingOfCourtEstimate(schedule: schedule, spots: spots),
        if (roundDurationSec < kocShallowRoundDurationSec) ...[
          const SizedBox(height: 12),
          const OrganizerInfoRow(
            icon: Icons.timer_outlined,
            title: 'Rodada curta',
            subtitle:
                'Abaixo de 10 min dá cerca de 12 rallies por dupla — raso para '
                'uma classificatória.',
          ),
        ],
      ],
    );
  }
}

/// Conta fechada do dia: quantas rodadas e quanto tempo de quadra.
class _KingOfCourtEstimate extends StatelessWidget {
  const _KingOfCourtEstimate({required this.schedule, required this.spots});

  final KingOfCourtSchedule schedule;
  final int spots;

  @override
  Widget build(BuildContext context) {
    if (!schedule.isValid) {
      return OrganizerInfoRow(
        icon: Icons.error_outline,
        title: 'Configuração não fecha',
        subtitle: spots < kocMinTeamsPerRound
            ? 'King of the Court precisa de pelo menos '
                  '$kocMinTeamsPerRound duplas.'
            : 'Com $spots duplas, esse número de classificadas não reduz o '
                  'campo entre as fases. Reduza "Classificam".',
      );
    }

    final phases = schedule.roundsPerPhase
        .map((rounds) => rounds == 1 ? '1 rodada' : '$rounds rodadas')
        .join(' → ');

    return OrganizerInfoRow(
      icon: Icons.schedule_outlined,
      title: '${schedule.totalLabel} de quadra',
      subtitle:
          '$spots duplas · ${schedule.totalRounds} rodadas em uma quadra '
          '($phases), já com trocas e intervalos.',
    );
  }
}

class _StepperField extends StatelessWidget {
  const _StepperField({
    required this.label,
    required this.valueLabel,
    required this.minReached,
    required this.maxReached,
    required this.onDecrement,
    required this.onIncrement,
  });

  final String label;
  final String valueLabel;
  final bool minReached;
  final bool maxReached;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OrganizerSectionLabel(label),
        const SizedBox(height: 8),
        OrganizerNumericStepper(
          valueLabel: valueLabel,
          minReached: minReached,
          maxReached: maxReached,
          onDecrement: minReached ? () {} : onDecrement,
          onIncrement: maxReached ? () {} : onIncrement,
        ),
      ],
    );
  }
}
