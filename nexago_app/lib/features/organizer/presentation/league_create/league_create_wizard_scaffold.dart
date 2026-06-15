import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/league_create/league_create_draft.dart';
import '../../domain/league_create/league_create_logic.dart';
import 'league_create_navigation.dart';
import '../widgets/organizer_wizard_scaffold.dart';

class LeagueCreateWizardScaffold extends ConsumerWidget {
  const LeagueCreateWizardScaffold({
    super.key,
    required this.step,
    required this.body,
    required this.footer,
    this.onBack,
    this.onClose,
  });

  final LeagueCreateStep step;
  final Widget body;
  final Widget footer;
  final VoidCallback? onBack;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return OrganizerWizardScaffold(
      title: 'Criar liga',
      stepLabel: leagueFormatStepLabel(step),
      stepNumber: step.number,
      totalSteps: LeagueCreateStepX.total,
      stepTitle: leagueStepTitle(step),
      stepSubtitle: leagueStepSubtitle(step),
      body: body,
      footer: footer,
      onBack: onBack,
      onClose: onClose ?? () => handleLeagueWizardClose(context, ref),
    );
  }
}
