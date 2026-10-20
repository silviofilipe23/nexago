import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/ui/app_snackbar.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../domain/professionals/arena_professionals_providers.dart';
import '../../../domain/professionals/arena_professionals_repository.dart';
import 'arena_professional_dialogs.dart';
import 'arena_professional_request_sheet.dart';

/// Fluxos usados pela lista e pelo detalhe. Erro de callable vira snackbar com
/// a mensagem que o servidor devolveu (já em português).

/// Roda a ação e avisa. `true` quando deu certo.
Future<bool> runArenaProfessorAction(
  BuildContext context,
  Future<ProfessorLinkResult> Function() action, {
  required String success,
  required String fallback,
}) async {
  try {
    await action();
    if (context.mounted) showAppSnackBar(context, success);
    return true;
  } on ProfessorLinkException catch (e) {
    if (context.mounted) showAppSnackBar(context, e.message, isError: true);
  } catch (_) {
    if (context.mounted) showAppSnackBar(context, fallback, isError: true);
  }
  return false;
}

/// Confirma (com motivo opcional) e rejeita o pedido. [onBusy] marca só a
/// ida ao servidor (não o diálogo aberto).
Future<bool> rejectArenaProfessorRequestFlow(
  BuildContext context,
  WidgetRef ref,
  ArenaProfessorLink link, {
  void Function(bool busy)? onBusy,
}) async {
  final answer = await confirmRejectArenaProfessorRequest(
    context,
    professorName: link.professorName,
  );
  if (answer == null || !context.mounted) return false;
  onBusy?.call(true);
  try {
    return await runArenaProfessorAction(
      context,
      () => ref
          .read(arenaProfessionalsRepositoryProvider)
          .reject(linkId: link.id, reason: answer.reason),
      success: 'Solicitação rejeitada. O professor foi avisado.',
      fallback: 'Não foi possível rejeitar a solicitação.',
    );
  } finally {
    onBusy?.call(false);
  }
}

/// Abre a análise; aprovar avisa, "Rejeitar" segue para a confirmação.
Future<void> analyzeArenaProfessorRequestFlow(
  BuildContext context,
  WidgetRef ref,
  ArenaProfessorLink link, {
  void Function(bool busy)? onBusy,
}) async {
  final outcome = await showArenaProfessorRequestSheet(context, link: link);
  if (!context.mounted) return;
  switch (outcome) {
    case ArenaProfessorRequestOutcome.approved:
      showAppSnackBar(context, 'Vínculo com ${link.professorName} aprovado.');
    case ArenaProfessorRequestOutcome.reject:
      await rejectArenaProfessorRequestFlow(
        context,
        ref,
        link,
        onBusy: onBusy,
      );
    case null:
      break;
  }
}
