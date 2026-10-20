import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import 'professor_links_ui.dart';

/// Confirmações das ações irreversíveis do professor.

/// Recusar convite direto do card da lista (na folha do convite a recusa já é
/// a decisão de quem leu o convite).
Future<bool> confirmDeclineProfessorInvite(
  BuildContext context, {
  required String arenaName,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => _ConfirmDialog(
      title: 'Recusar convite?',
      body:
          'A $arenaName é avisada. Se mudar de ideia, peça vínculo pela página '
          'da arena.',
      confirmLabel: 'Recusar',
    ),
  );
  return result == true;
}

Future<bool> confirmCancelProfessorRequest(
  BuildContext context, {
  required String arenaName,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => _ConfirmDialog(
      title: 'Cancelar solicitação?',
      body:
          'O pedido para a $arenaName sai da fila da arena. Você pode pedir de '
          'novo quando quiser.',
      confirmLabel: 'Cancelar solicitação',
      cancelLabel: 'Voltar',
    ),
  );
  return result == true;
}

/// Encerrar é imediato: devolve o motivo (opcional) ou `null` se desistiu.
Future<({String? reason})?> confirmEndProfessorLink(
  BuildContext context, {
  required String arenaName,
}) {
  return showDialog<({String? reason})>(
    context: context,
    builder: (ctx) => _EndLinkDialog(arenaName: arenaName),
  );
}

class _ConfirmDialog extends StatelessWidget {
  const _ConfirmDialog({
    required this.title,
    required this.body,
    required this.confirmLabel,
    this.cancelLabel = 'Voltar',
  });

  final String title;
  final String body;
  final String confirmLabel;
  final String cancelLabel;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          key: const Key('professor-link-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel),
        ),
      ],
    );
  }
}

class _EndLinkDialog extends StatefulWidget {
  const _EndLinkDialog({required this.arenaName});

  final String arenaName;

  @override
  State<_EndLinkDialog> createState() => _EndLinkDialogState();
}

class _EndLinkDialogState extends State<_EndLinkDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AlertDialog(
      title: const Text('Encerrar vínculo?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Você deixa de ser professor na ${widget.arenaName}: as '
              'permissões acabam na hora e a arena é avisada. Seus vínculos '
              'com outras arenas não mudam.',
            ),
            const SizedBox(height: 14),
            TextField(
              key: const Key('professor-link-end-reason'),
              controller: _reason,
              maxLength: 300,
              maxLines: 3,
              minLines: 2,
              textCapitalization: TextCapitalization.sentences,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                labelText: 'Motivo (opcional)',
                hintText: 'Conte para a arena por que está saindo',
                hintStyle: AppTypography.bodyS.copyWith(
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('professor-link-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () {
            final text = _reason.text.trim();
            Navigator.pop(context, (reason: text.isEmpty ? null : text));
          },
          child: const Text('Encerrar'),
        ),
      ],
    );
  }
}
