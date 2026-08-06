import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'tournament_registration_cancellation_section.dart';

/// Formulário do pedido de cancelamento ao organizador. Devolve o motivo pelo
/// `Navigator.pop` (ou `null` se o atleta desistir).
///
/// O aviso de que a nexaGO não devolve o dinheiro fica ACIMA do campo, antes de
/// o atleta escrever: é a informação que muda a decisão dele.
class TournamentCancellationRequestSheet extends StatefulWidget {
  const TournamentCancellationRequestSheet({
    super.key,
    required this.controller,
    required this.tournamentName,
  });

  final TextEditingController controller;
  final String tournamentName;

  @override
  State<TournamentCancellationRequestSheet> createState() =>
      _TournamentCancellationRequestSheetState();
}

class _TournamentCancellationRequestSheetState
    extends State<TournamentCancellationRequestSheet> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canSend = widget.controller.text.trim().isNotEmpty;

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
          TextField(
            controller: widget.controller,
            maxLines: 3,
            maxLength: 500,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Por que você precisa cancelar?',
              hintText: 'Escreva um motivo para o organizador',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: canSend
                ? () => Navigator.pop(context, widget.controller.text)
                : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
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
