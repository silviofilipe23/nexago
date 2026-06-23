import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/tournament_create/tournament_create_draft.dart';
import '../../domain/tournament_create/tournament_create_logic.dart';
import '../../domain/tournament_create/tournament_create_providers.dart';
import '../widgets/organizer_wizard_exit_dialog.dart';

export '../widgets/organizer_wizard_exit_dialog.dart' show WizardCloseAction;

TournamentCreateStep? nextCreateStep(TournamentCreateStep step) {
  final index = step.index + 1;
  if (index >= TournamentCreateStep.values.length) return null;
  return TournamentCreateStep.values[index];
}

TournamentCreateStep? previousCreateStep(TournamentCreateStep step) {
  final index = step.index - 1;
  if (index < 0) return null;
  return TournamentCreateStep.values[index];
}

String routeNameForCreateStep(TournamentCreateStep step) => switch (step) {
      TournamentCreateStep.identity =>
        AppRouteNames.organizerTournamentCreateIdentity,
      TournamentCreateStep.location =>
        AppRouteNames.organizerTournamentCreateLocation,
      TournamentCreateStep.categories =>
        AppRouteNames.organizerTournamentCreateCategories,
      TournamentCreateStep.registration =>
        AppRouteNames.organizerTournamentCreateRegistration,
      TournamentCreateStep.rules =>
        AppRouteNames.organizerTournamentCreateRules,
      TournamentCreateStep.review =>
        AppRouteNames.organizerTournamentCreateReview,
    };

TournamentCreateStep stepFromRouteName(String name) => switch (name) {
      AppRouteNames.organizerTournamentCreateIdentity =>
        TournamentCreateStep.identity,
      AppRouteNames.organizerTournamentCreateLocation =>
        TournamentCreateStep.location,
      AppRouteNames.organizerTournamentCreateCategories =>
        TournamentCreateStep.categories,
      AppRouteNames.organizerTournamentCreateRegistration =>
        TournamentCreateStep.registration,
      AppRouteNames.organizerTournamentCreatePrizes =>
        TournamentCreateStep.rules,
      AppRouteNames.organizerTournamentCreateRules =>
        TournamentCreateStep.rules,
      AppRouteNames.organizerTournamentCreateReview =>
        TournamentCreateStep.review,
      _ => TournamentCreateStep.identity,
    };

void syncWizardStep(WidgetRef ref, TournamentCreateStep step) {
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(step);
}

void goToCreateStep(BuildContext context, WidgetRef ref, TournamentCreateStep step) {
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(step);
  context.goNamed(routeNameForCreateStep(step));
}

void goToNextCreateStep(
  BuildContext context,
  WidgetRef ref,
  TournamentCreateStep current,
) {
  final next = nextCreateStep(current);
  if (next == null) return;
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(next);
  context.pushNamed(routeNameForCreateStep(next));
}

Future<WizardCloseAction?> confirmExitWizard(
  BuildContext context, {
  WizardExitDialogConfig? config,
}) {
  return showOrganizerWizardExitDialog(context, config: config);
}

Future<void> handleWizardClose(BuildContext context, WidgetRef ref) async {
  final draft = ref.read(tournamentCreateDraftProvider);
  final categoryCount = draft.categories.length;
  final action = await confirmExitWizard(
    context,
    config: WizardExitDialogConfig(
      categoryHighlight: tournamentWizardExitCategoryHighlight(categoryCount),
      discardSubtitle: tournamentWizardDiscardSubtitle(categoryCount),
    ),
  );
  if (!context.mounted) return;

  switch (action) {
    case WizardCloseAction.exit:
      context.goNamed(AppRouteNames.organizerHome);
    case WizardCloseAction.discard:
      await ref.read(tournamentCreateWizardProvider.notifier).discardSession();
      if (context.mounted) {
        context.goNamed(AppRouteNames.organizerHome);
      }
    case WizardCloseAction.keepEditing:
    case null:
      break;
  }
}

Future<bool?> confirmStartFreshWizard(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Cadastro em andamento'),
      content: const Text(
        'Você tem um torneio sendo criado. Deseja continuar de onde parou ou começar do zero?',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Continuar cadastro'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Começar do zero'),
        ),
      ],
    ),
  );
}

Future<void> openTournamentWizardForEdit(
  BuildContext context,
  WidgetRef ref, {
  required Map<String, dynamic> tournament,
  required String tournamentId,
  required TournamentCreateStep step,
}) async {
  if (!context.mounted) return;

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => const Center(child: CircularProgressIndicator()),
  );

  try {
    await ref.read(tournamentCreateWizardProvider.notifier).loadTournamentFromFirestore(
          tournament,
          tournamentId,
          step: step,
        );
    if (!context.mounted) return;
    Navigator.of(context).pop();
    context.pushNamed(routeNameForCreateStep(step));
  } catch (e) {
    if (context.mounted) {
      Navigator.of(context).pop();
      showAppSnackBar(context, 'Erro ao carregar torneio: $e', isError: true);
    }
  }
}
