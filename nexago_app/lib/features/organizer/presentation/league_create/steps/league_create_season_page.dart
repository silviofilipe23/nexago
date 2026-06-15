import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_logic.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueCreateSeasonPage extends ConsumerStatefulWidget {
  const LeagueCreateSeasonPage({super.key});

  @override
  ConsumerState<LeagueCreateSeasonPage> createState() =>
      _LeagueCreateSeasonPageState();
}

class _LeagueCreateSeasonPageState extends ConsumerState<LeagueCreateSeasonPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncLeagueWizardStep(ref, LeagueCreateStep.season);
    });
  }

  Future<void> _pickMonth({
    required bool isStart,
  }) async {
    final draft = ref.read(leagueCreateDraftProvider);
    final initial = isStart
        ? (draft.seasonStartAt ?? DateTime.now())
        : (draft.seasonEndAt ?? draft.seasonStartAt ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: isStart ? 'Início da temporada' : 'Fim da temporada',
    );
    if (picked == null) return;

    final monthDate = DateTime(picked.year, picked.month);
    final notifier = ref.read(leagueCreateWizardProvider.notifier);
    if (isStart) {
      notifier.setSeasonStartAt(monthDate);
    } else {
      notifier.setSeasonEndAt(monthDate);
    }
    notifier.syncStagesWithPlan();
  }

  Future<void> _handleClose() => handleLeagueWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue =
        ref.watch(leagueCreateCanContinueProvider(LeagueCreateStep.season));
    final notifier = ref.read(leagueCreateWizardProvider.notifier);

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.season,
      onBack: () {
        syncLeagueWizardStep(ref, LeagueCreateStep.identity);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OrganizerDateField(
            label: 'INÍCIO DA TEMPORADA',
            value: formatLeagueMonthYear(draft.seasonStartAt),
            onTap: () => _pickMonth(isStart: true),
          ),
          const SizedBox(height: 16),
          OrganizerDateField(
            label: 'FIM DA TEMPORADA',
            value: formatLeagueMonthYear(draft.seasonEndAt),
            onTap: () => _pickMonth(isStart: false),
          ),
          const SizedBox(height: 20),
          const OrganizerSectionLabel('ETAPAS PLANEJADAS'),
          const SizedBox(height: 8),
          OrganizerNumericStepper(
            valueLabel: '${draft.plannedStagesCount} etapas',
            minReached: draft.plannedStagesCount <= 2,
            maxReached: draft.plannedStagesCount >= 12,
            onDecrement: () =>
                notifier.setPlannedStagesCount(draft.plannedStagesCount - 1),
            onIncrement: () =>
                notifier.setPlannedStagesCount(draft.plannedStagesCount + 1),
          ),
          const SizedBox(height: 6),
          Text(
            'Entre 2 e 12 etapas regulares na temporada.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 20),
          OrganizerToggleSettingRow(
            icon: Icons.emoji_events_outlined,
            title: 'Grande Final',
            subtitle:
                'Etapa extra com as melhores duplas do ranking da temporada.',
            value: draft.grandFinalEnabled,
            onChanged: notifier.setGrandFinalEnabled,
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.info_outline_rounded,
                  color: AppColors.brand,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Você define as etapas depois. Aqui só planeja quantas '
                    'terá na temporada — pode adicionar ou ajustar ao longo do ano.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          height: 1.45,
                        ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextLeagueCreateStep(
          context,
          ref,
          LeagueCreateStep.season,
        ),
      ),
    );
  }
}
