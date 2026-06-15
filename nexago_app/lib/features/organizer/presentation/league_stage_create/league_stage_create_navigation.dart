import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../domain/league_stage_create/league_stage_create_draft.dart';
import '../../domain/league_stage_create/league_stage_create_providers.dart';
import '../tournament_create/tournament_create_navigation.dart';

LeagueStageCreateStep? nextLeagueStageCreateStep(LeagueStageCreateStep step) {
  final index = step.index + 1;
  if (index >= LeagueStageCreateStep.values.length) return null;
  return LeagueStageCreateStep.values[index];
}

LeagueStageCreateStep? previousLeagueStageCreateStep(
  LeagueStageCreateStep step,
) {
  final index = step.index - 1;
  if (index < 0) return null;
  return LeagueStageCreateStep.values[index];
}

String routeNameForLeagueStageCreateStep(LeagueStageCreateStep step) =>
    switch (step) {
      LeagueStageCreateStep.location =>
        AppRouteNames.organizerLeagueStageCreateLocation,
      LeagueStageCreateStep.categoriesRegistration =>
        AppRouteNames.organizerLeagueStageCreateCategories,
      LeagueStageCreateStep.review =>
        AppRouteNames.organizerLeagueStageCreateReview,
    };

LeagueStageCreateStep leagueStageStepFromRouteName(String name) =>
    switch (name) {
      AppRouteNames.organizerLeagueStageCreateLocation =>
        LeagueStageCreateStep.location,
      AppRouteNames.organizerLeagueStageCreateCategories =>
        LeagueStageCreateStep.categoriesRegistration,
      AppRouteNames.organizerLeagueStageCreateReview =>
        LeagueStageCreateStep.review,
      _ => LeagueStageCreateStep.location,
    };

void syncLeagueStageWizardStep(WidgetRef ref, LeagueStageCreateStep step) {
  ref.read(leagueStageCreateWizardProvider.notifier).setCurrentStep(step);
}

String leagueIdFromRoute(BuildContext context) =>
    GoRouterState.of(context).pathParameters['leagueId']?.trim() ?? '';

void goToLeagueStageCreateStep(
  BuildContext context,
  WidgetRef ref,
  LeagueStageCreateStep step,
  String leagueId,
) {
  ref.read(leagueStageCreateWizardProvider.notifier).setCurrentStep(step);
  context.goNamed(
    routeNameForLeagueStageCreateStep(step),
    pathParameters: {'leagueId': leagueId},
  );
}

void goToNextLeagueStageCreateStep(
  BuildContext context,
  WidgetRef ref,
  LeagueStageCreateStep current,
  String leagueId,
) {
  final next = nextLeagueStageCreateStep(current);
  if (next == null) return;
  ref.read(leagueStageCreateWizardProvider.notifier).setCurrentStep(next);
  context.pushNamed(
    routeNameForLeagueStageCreateStep(next),
    pathParameters: {'leagueId': leagueId},
  );
}

Future<void> handleLeagueStageWizardClose(
  BuildContext context,
  WidgetRef ref,
) async {
  final action = await confirmExitWizard(context);
  if (!context.mounted) return;

  switch (action) {
    case WizardCloseAction.exit:
      context.goNamed(AppRouteNames.organizerHome);
    case WizardCloseAction.discard:
      await ref.read(leagueStageCreateWizardProvider.notifier).clearSession();
      if (context.mounted) {
        context.goNamed(AppRouteNames.organizerHome);
      }
    case WizardCloseAction.keepEditing:
    case null:
      break;
  }
}

Future<bool?> confirmStartFreshStageWizard(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Etapa em andamento'),
      content: const Text(
        'Você tem uma etapa sendo criada. Deseja continuar de onde parou ou começar do zero?',
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

Future<void> startLeagueStageWizard(
  BuildContext context,
  WidgetRef ref,
  String leagueId,
) async {
  final id = leagueId.trim();
  if (id.isEmpty) return;

  final hasLocal = ref.read(hasMeaningfulLocalStageWizardSessionProvider);
  final currentLeagueId = ref.read(leagueStageCreateDraftProvider).leagueId;

  if (hasLocal && currentLeagueId == id) {
    final step = ref.read(leagueStageCreateCurrentStepProvider);
    context.pushNamed(
      routeNameForLeagueStageCreateStep(step),
      pathParameters: {'leagueId': id},
    );
    return;
  }

  if (hasLocal && currentLeagueId.isNotEmpty && currentLeagueId != id) {
    final startFresh = await confirmStartFreshStageWizard(context);
    if (!context.mounted || startFresh == null) return;
    if (!startFresh) {
      final step = ref.read(leagueStageCreateCurrentStepProvider);
      context.pushNamed(
        routeNameForLeagueStageCreateStep(step),
        pathParameters: {'leagueId': currentLeagueId},
      );
      return;
    }
    await ref.read(leagueStageCreateWizardProvider.notifier).clearSession();
  }

  final notifier = ref.read(leagueStageCreateWizardProvider.notifier);
  await notifier.tryRestoreFromLocal(id);
  final restored = ref.read(leagueStageCreateDraftProvider);
  if (restored.leagueId != id) {
    try {
      await notifier.loadLeagueContext(id);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível carregar a liga: $e')),
        );
      }
      return;
    }
  }

  if (!context.mounted) return;
  context.pushNamed(
    AppRouteNames.organizerLeagueStageCreateLocation,
    pathParameters: {'leagueId': id},
  );
}

Future<void> ensureLeagueStageWizardLoaded(
  WidgetRef ref,
  String leagueId,
) async {
  final id = leagueId.trim();
  if (id.isEmpty) return;

  final draft = ref.read(leagueStageCreateDraftProvider);
  if (draft.leagueId == id && draft.leagueName.isNotEmpty) return;

  final notifier = ref.read(leagueStageCreateWizardProvider.notifier);
  await notifier.tryRestoreFromLocal(id);
  final restored = ref.read(leagueStageCreateDraftProvider);
  if (restored.leagueId != id) {
    await notifier.loadLeagueContext(id);
  }
}
