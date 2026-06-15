import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/league_stage_create/league_stage_create_draft.dart';
import '../../domain/league_stage_create/league_stage_create_logic.dart';
import 'league_stage_create_navigation.dart';
import '../widgets/organizer_wizard_scaffold.dart';

class LeagueStageCreateWizardScaffold extends ConsumerWidget {
  const LeagueStageCreateWizardScaffold({
    super.key,
    required this.step,
    required this.body,
    required this.footer,
    this.onBack,
    this.onClose,
  });

  final LeagueStageCreateStep step;
  final Widget body;
  final Widget footer;
  final VoidCallback? onBack;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return OrganizerWizardScaffold(
      title: 'Nova etapa',
      stepLabel: leagueStageFormatStepLabel(step),
      stepNumber: step.number,
      totalSteps: LeagueStageCreateStepX.total,
      stepTitle: leagueStageStepTitle(step),
      stepSubtitle: leagueStageStepSubtitle(step),
      body: body,
      footer: footer,
      onBack: onBack,
      onClose: onClose ?? () => handleLeagueStageWizardClose(context, ref),
    );
  }
}
