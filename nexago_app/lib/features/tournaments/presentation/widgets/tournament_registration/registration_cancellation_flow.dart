import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/ui/app_snackbar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_partner_invite_service.dart';
import 'tournament_cancellation_request_sheet.dart';

/// Fluxo compartilhado de cancelamento de inscrição — mecânica idêntica nas
/// 3 superfícies que hoje escrevem isso à mão (aba "Minha inscrição", tela
/// de pagamento e tela de detalhe): confirma com o atleta e cancela direto
/// (quando `canCancelDirectly`), ou abre o pedido ao organizador e chama
/// `requestRegistrationCancellation` (quando não pode cancelar direto).
///
/// Devolve `true` SÓ quando a inscrição foi de fato cancelada pelo fluxo
/// direto — quem chama decide o que fazer depois (navegar, invalidar
/// providers específicos da tela, snackbar de sucesso com a própria copy).
/// O pedido ao organizador não cancela nada: dá o próprio feedback
/// ("Pedido enviado...") e sempre devolve `false`. Em qualquer desistência
/// (dialog/sheet fechados sem confirmar) ou erro (`showAppSnackBar` já
/// mostrado aqui), também devolve `false` — nada mais para o chamador fazer.
///
/// Copy do diálogo de confirmação (título/conteúdo/botão) e o rótulo
/// tournamentName do pedido ao organizador variam por tela — por isso são
/// parâmetros; quando título/conteúdo/botão não são informados, cai no
/// texto padrão (igual ao que a aba e o detalhe já mostravam).
Future<bool> runRegistrationCancellationFlow(
  BuildContext context,
  WidgetRef ref, {
  required String registrationId,
  required String tournamentName,
  required bool canCancelDirectly,
  String? categoryName,
  String? confirmDialogTitle,
  String? confirmDialogContent,
  String? confirmButtonLabel,
}) async {
  if (canCancelDirectly) {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(confirmDialogTitle ?? 'Cancelar inscrição?'),
        content: Text(
          confirmDialogContent ??
              'Sua vaga no $tournamentName (${categoryName ?? 'categoria'}) '
                  'será liberada e outro atleta poderá se inscrever.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(confirmButtonLabel ?? 'Cancelar inscrição'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return false;

    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelRegistration(registrationId);
      return true;
    } on TournamentPartnerInviteException catch (e) {
      if (context.mounted) showAppSnackBar(context, e.message, isError: true);
      return false;
    }
  }

  final reason = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => TournamentCancellationRequestSheet(
      tournamentName: tournamentName,
    ),
  );
  if (reason == null || reason.trim().isEmpty || !context.mounted) {
    return false;
  }

  try {
    await ref
        .read(tournamentPartnerInviteServiceProvider)
        .requestRegistrationCancellation(
          registrationId: registrationId,
          reason: reason,
        );
    if (context.mounted) {
      showAppSnackBar(context, 'Pedido enviado. O organizador foi avisado.');
    }
  } on TournamentPartnerInviteException catch (e) {
    if (context.mounted) showAppSnackBar(context, e.message, isError: true);
  }
  return false;
}
