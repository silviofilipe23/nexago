import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Confirmações das ações irreversíveis do gestor (copy do portal da arena).
/// Os que aceitam motivo devolvem `(reason: ...)` (vazio = `null`) ou `null`
/// quando o gestor desistiu.

Future<({String? reason})?> confirmRejectArenaProfessorRequest(
  BuildContext context, {
  required String professorName,
}) =>
    showDialog<({String? reason})>(
      context: context,
      builder: (_) => _ReasonDialog(
        title: 'Rejeitar a solicitação de $professorName?',
        body: 'O professor recebe o aviso e pode pedir de novo depois.',
        reasonHint: 'Conte ao professor por que não deu certo',
        confirmLabel: 'Rejeitar',
      ),
    );

Future<({String? reason})?> confirmEndArenaProfessorLink(
  BuildContext context, {
  required String professorName,
}) =>
    showDialog<({String? reason})>(
      context: context,
      builder: (_) => _ReasonDialog(
        title: 'Encerrar o vínculo com $professorName?',
        body: 'As permissões dele nesta arena acabam agora e ele sai da '
            'página pública. O histórico fica guardado e os vínculos com '
            'outras arenas não mudam.',
        reasonHint: 'Motivo do encerramento',
        confirmLabel: 'Encerrar vínculo',
      ),
    );

Future<bool> confirmCancelArenaProfessorInvite(
  BuildContext context, {
  required String professorName,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Cancelar o convite para $professorName?'),
      content: const Text(
        'O convite deixa de valer. Você pode convidar de novo quando quiser.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Voltar'),
        ),
        FilledButton(
          key: const Key('arena-professor-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cancelar convite'),
        ),
      ],
    ),
  );
  return result == true;
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({
    required this.title,
    required this.body,
    required this.reasonHint,
    required this.confirmLabel,
  });

  final String title;
  final String body;
  final String reasonHint;
  final String confirmLabel;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
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
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.body),
            const SizedBox(height: 14),
            TextField(
              key: const Key('arena-professor-reason'),
              controller: _reason,
              maxLength: 300,
              maxLines: 3,
              minLines: 2,
              textCapitalization: TextCapitalization.sentences,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              decoration: InputDecoration(
                labelText: 'Motivo (opcional)',
                hintText: widget.reasonHint,
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
          key: const Key('arena-professor-confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          onPressed: () {
            final text = _reason.text.trim();
            Navigator.pop(context, (reason: text.isEmpty ? null : text));
          },
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
