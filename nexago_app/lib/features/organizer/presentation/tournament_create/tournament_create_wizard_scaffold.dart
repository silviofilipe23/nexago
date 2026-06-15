import 'package:flutter/material.dart';

import '../../domain/tournament_create/tournament_create_draft.dart';
import '../../domain/tournament_create/tournament_create_logic.dart';
import 'tournament_create_navigation.dart';
import '../widgets/organizer_wizard_scaffold.dart';

class TournamentCreateWizardScaffold extends StatelessWidget {
  const TournamentCreateWizardScaffold({
    super.key,
    required this.step,
    required this.body,
    required this.footer,
    this.onBack,
    this.onClose,
  });

  final TournamentCreateStep step;
  final Widget body;
  final Widget footer;
  final VoidCallback? onBack;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return OrganizerWizardScaffold(
      title: 'Criar torneio',
      stepLabel: formatStepLabel(step),
      stepNumber: step.number,
      totalSteps: TournamentCreateStepX.total,
      stepTitle: stepTitle(step),
      stepSubtitle: stepSubtitle(step),
      body: body,
      footer: footer,
      onBack: onBack,
      onClose: onClose,
    );
  }
}

Future<bool?> confirmDiscardDraft(BuildContext context) {
  return confirmExitWizard(context).then(
    (action) => switch (action) {
      WizardCloseAction.discard => true,
      WizardCloseAction.exit => false,
      WizardCloseAction.keepEditing => false,
      null => null,
    },
  );
}
