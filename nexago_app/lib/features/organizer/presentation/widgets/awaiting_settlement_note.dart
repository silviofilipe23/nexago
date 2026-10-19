import 'package:flutter/material.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// "A liberar": cartão aprovado que ainda não liquidou. A inscrição já está
/// paga e a vaga garantida, mas o dinheiro só cai no caixa na liquidação —
/// sem esta linha, o organizador vê a dupla paga com o caixa parado e abre
/// chamado. Usada no Financeiro (caixas) e no Financeiro do torneio, com o
/// mesmo texto nos dois.
class AwaitingSettlementNote extends StatelessWidget {
  const AwaitingSettlementNote({super.key, required this.amountReais});

  final double amountReais;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.schedule_rounded, size: 16, color: colors.onSurfaceMuted),
            const SizedBox(width: 6),
            Text(
              'A liberar',
              style: textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            Text(
              formatBRL(amountReais),
              style: textTheme.titleSmall?.copyWith(
                color: colors.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Pagamentos no cartão caem no caixa cerca de 32 dias depois da '
          'aprovação. O valor já vem sem as taxas.',
          style: textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
        ),
      ],
    );
  }
}
