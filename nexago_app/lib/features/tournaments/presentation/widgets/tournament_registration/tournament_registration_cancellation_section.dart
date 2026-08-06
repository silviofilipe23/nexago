import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_registration_service.dart';

/// Textos do cancelamento. A regra do produto é que a plataforma NÃO devolve
/// dinheiro — e isso precisa estar dito em todo estado, não só no primeiro.
abstract final class TournamentCancellationCopy {
  TournamentCancellationCopy._();

  static const refundOutsidePlatform =
      'A nexaGO não processa o reembolso. Ao aprovar, o organizador libera sua '
      'vaga — a devolução do valor pago é combinada diretamente com ele, fora '
      'da plataforma.';

  static const pendingNotice =
      'Aguardando o organizador. Combine a devolução do valor diretamente '
      'com ele.';
}

/// Bloco de cancelamento no passo de pagamento. Assume três formas conforme a
/// inscrição: cancelar direto (sem pagamento), pedir ao organizador (paga) ou
/// acompanhar o pedido já enviado.
class TournamentRegistrationCancellationSection extends StatelessWidget {
  const TournamentRegistrationCancellationSection({
    super.key,
    required this.snapshot,
    this.onCancelDirectly,
    this.onRequestCancellation,
    this.onContactOrganizer,
    this.contactBusy = false,
  });

  final TournamentRegistrationSnapshot? snapshot;

  /// Cancelamento direto (só quando não há pagamento nenhum).
  final VoidCallback? onCancelDirectly;

  /// Abre o formulário de pedido ao organizador (inscrição paga).
  final VoidCallback? onRequestCancellation;

  /// Abre o WhatsApp do organizador para acertar o reembolso.
  final VoidCallback? onContactOrganizer;
  final bool contactBusy;

  @override
  Widget build(BuildContext context) {
    final snap = snapshot;
    if (snap == null) return const SizedBox.shrink();

    final request = snap.cancellationRequest;
    if (request != null && request.isPending) {
      return _PendingRequestCard(
        onContactOrganizer: onContactOrganizer,
        contactBusy: contactBusy,
      );
    }

    if (onCancelDirectly != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextButton(
          onPressed: onCancelDirectly,
          child: Text(
            'Cancelar reserva',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
          ),
        ),
      );
    }

    if (onRequestCancellation == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (request != null && request.isDeclined)
          _DeclinedCard(responseNote: request.responseNote),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TextButton(
            onPressed: onRequestCancellation,
            child: Text(
              'Solicitar cancelamento',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PendingRequestCard extends StatelessWidget {
  const _PendingRequestCard({
    required this.onContactOrganizer,
    required this.contactBusy,
  });

  final VoidCallback? onContactOrganizer;
  final bool contactBusy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Cancelamento solicitado',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            TournamentCancellationCopy.pendingNotice,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.45,
            ),
          ),
          if (onContactOrganizer != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: contactBusy ? null : onContactOrganizer,
              icon: const Icon(Icons.chat_outlined, size: 18),
              label: Text(
                contactBusy ? 'Abrindo…' : 'Falar com o organizador',
              ),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DeclinedCard extends StatelessWidget {
  const _DeclinedCard({required this.responseNote});

  final String responseNote;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.live.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Pedido de cancelamento recusado',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          if (responseNote.trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              '“${responseNote.trim()}”',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.45,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
