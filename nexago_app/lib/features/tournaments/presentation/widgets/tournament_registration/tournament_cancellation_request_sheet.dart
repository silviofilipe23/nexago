import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'tournament_registration_cancellation_section.dart';

/// Formulário do pedido de cancelamento ao organizador. Devolve o motivo pelo
/// `Navigator.pop` (ou `null` se o atleta desistir).
///
/// O aviso de que a nexaGO não devolve o dinheiro fica ACIMA do campo, antes de
/// o atleta escrever: é a informação que muda a decisão dele.
///
/// O controller do campo é interno (criado e descartado pelo próprio
/// `State`) de propósito: um controller passado de fora e descartado pelo
/// chamador logo após o `Navigator.pop` corre contra a animação de
/// fechamento do bottom sheet — o `TextField` ainda reconstrói durante a
/// transição e tenta reescutar um controller já `dispose()`d, derrubando a
/// árvore com "TextEditingController was used after being disposed".
/// Deixando o ciclo de vida do controller preso ao do próprio widget, o
/// framework só o descarta quando o `State` é de fato desmontado.
class TournamentCancellationRequestSheet extends StatefulWidget {
  const TournamentCancellationRequestSheet({
    super.key,
    required this.tournamentName,
  });

  final String tournamentName;

  @override
  State<TournamentCancellationRequestSheet> createState() =>
      _TournamentCancellationRequestSheetState();
}

class _TournamentCancellationRequestSheetState
    extends State<TournamentCancellationRequestSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final canSend = _controller.text.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Solicitar cancelamento',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.pending.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.pending.withValues(alpha: 0.35),
              ),
            ),
            child: Text(
              TournamentCancellationCopy.refundOutsidePlatform,
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurface,
                height: 1.45,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Por que você precisa cancelar?',
            style: AppTypography.bodyM.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _controller,
            minLines: 3,
            maxLines: 5,
            maxLength: 500,
            autofocus: true,
            cursorColor: AppColors.brand,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            style: AppTypography.bodyM.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              hintText: 'Escreva um motivo para o organizador',
              hintStyle: AppTypography.bodyM.copyWith(
                color: colors.onSurfaceMuted.withValues(alpha: 0.6),
              ),
              alignLabelWithHint: true,
              filled: true,
              fillColor: colors.surfaceRaised,
              contentPadding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide:
                    const BorderSide(color: AppColors.brand, width: 1.5),
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: canSend
                ? () => Navigator.pop(context, _controller.text)
                : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
            ),
            child: const Text('Enviar pedido'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Voltar'),
          ),
        ],
      ),
    );
  }
}
