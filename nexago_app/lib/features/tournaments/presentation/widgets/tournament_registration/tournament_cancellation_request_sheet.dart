import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
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
          TextField(
            controller: _controller,
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
                ? () => Navigator.pop(context, _controller.text)
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
