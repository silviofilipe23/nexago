import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/league_create/league_create_draft.dart';
import '../../../domain/league_create/league_create_logic.dart';
import '../../../domain/league_create/league_create_providers.dart';
import '../league_create_navigation.dart';
import '../league_create_wizard_scaffold.dart';
import '../sheets/league_stage_editor_sheet.dart';
import '../../tournament_create/widgets/organizer_form_widgets.dart';

class LeagueCreateStagesPage extends ConsumerStatefulWidget {
  const LeagueCreateStagesPage({super.key});

  @override
  ConsumerState<LeagueCreateStagesPage> createState() =>
      _LeagueCreateStagesPageState();
}

class _LeagueCreateStagesPageState extends ConsumerState<LeagueCreateStagesPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      syncLeagueWizardStep(ref, LeagueCreateStep.stages);
      ref.read(leagueCreateWizardProvider.notifier).ensureDefaultStages();
    });
  }

  Future<void> _handleClose() => handleLeagueWizardClose(context, ref);

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(leagueCreateDraftProvider);
    final canContinue =
        ref.watch(leagueCreateCanContinueProvider(LeagueCreateStep.stages));
    final defined = draft.definedStagesCount;
    final total = draft.stages.length;

    return LeagueCreateWizardScaffold(
      step: LeagueCreateStep.stages,
      onBack: () {
        syncLeagueWizardStep(ref, LeagueCreateStep.ranking);
        Navigator.of(context).maybePop();
      },
      onClose: _handleClose,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$defined de $total definidas',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              Text(
                'Toque para editar',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final stage in draft.stages) ...[
            _StageCard(
              stage: stage,
              onTap: () => showLeagueStageEditorSheet(
                context,
                ref,
                stage: stage,
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
      footer: OrganizerWizardContinueButton(
        label: 'Continuar',
        enabled: canContinue,
        onPressed: () => goToNextLeagueCreateStep(
          context,
          ref,
          LeagueCreateStep.stages,
        ),
      ),
    );
  }
}

class _StageCard extends StatelessWidget {
  const _StageCard({
    required this.stage,
    required this.onTap,
  });

  final LeagueStageDraft stage;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDefined = stage.status == LeagueStageStatus.defined;
    final isGrandFinal = stage.isGrandFinal;

    return Material(
      color: isDefined
          ? context.themeColors.surfaceCard
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isGrandFinal
                  ? AppColors.brand.withValues(alpha: 0.35)
                  : isDefined
                      ? context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.12)
                      : context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.2),
              width: isGrandFinal ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isGrandFinal
                      ? AppColors.brand.withValues(alpha: 0.15)
                      : isDefined
                          ? AppColors.brand.withValues(alpha: 0.1)
                          : context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isGrandFinal
                      ? Icons.emoji_events_outlined
                      : isDefined
                          ? Icons.check_circle_outline_rounded
                          : Icons.schedule_outlined,
                  color: isDefined || isGrandFinal
                      ? AppColors.brand
                      : context.themeColors.onSurfaceMuted,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      stage.name,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      leagueStageSubtitle(stage),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            height: 1.35,
                          ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isDefined
                      ? const Color(0xFF22C55E).withValues(alpha: 0.12)
                      : context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  isDefined ? 'Definida' : 'Pendente',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: isDefined
                            ? const Color(0xFF22C55E)
                            : context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
