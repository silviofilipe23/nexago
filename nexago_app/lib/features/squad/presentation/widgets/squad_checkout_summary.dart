import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Resumo do checkout com o desconto do código de embaixador (NexaSquad):
/// preço cheio, desconto, cashback e total. Usado na inscrição, na reserva de
/// quadra e no clubinho — o desconto sai da taxa da nexaGO, então o preço do
/// recebedor não muda. Na inscrição também leva a "Taxa de serviço" quando o
/// atleta paga parte da taxa (e aí pode aparecer sem desconto).
class SquadCheckoutSummary extends StatelessWidget {
  const SquadCheckoutSummary({
    super.key,
    required this.priceCents,
    required this.discountCents,
    required this.discountLabel,
    required this.cashbackCents,
    required this.totalCents,
    this.priceLabel = 'Inscrição',
    this.serviceFeeCents = 0,
    this.ownPerkCents = 0,
    this.ownPerkLabel = 'Benefício de embaixador',
  });

  final int priceCents;
  final int discountCents;
  final String discountLabel;
  final int cashbackCents;
  final int totalCents;

  /// Rótulo do preço cheio: "Inscrição", "Reserva", "Sinal (50%)", "Vaga".
  final String priceLabel;

  /// Parte da taxa de serviço paga pelo atleta, por cima do preço (só a
  /// inscrição tem); a linha só aparece quando é maior que zero.
  final int serviceFeeCents;

  /// Desconto do PRÓPRIO embaixador na parcela dele (só na inscrição); a
  /// linha só aparece quando é maior que zero.
  final int ownPerkCents;
  final String ownPerkLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    Widget line(String k, String v, {Color? color}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  k,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: colors.onSurfaceMuted),
                ),
              ),
              Text(
                v,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: color ?? colors.onSurface,
                ),
              ),
            ],
          ),
        );
    return Column(
      key: const Key('squad-summary'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        line(priceLabel, formatBRLFromCents(priceCents)),
        if (serviceFeeCents > 0)
          line('Taxa de serviço', formatBRLFromCents(serviceFeeCents)),
        if (discountCents > 0)
          line(
            discountLabel,
            '− ${formatBRLFromCents(discountCents)}',
            color: colors.win,
          ),
        if (ownPerkCents > 0)
          line(
            ownPerkLabel,
            '− ${formatBRLFromCents(ownPerkCents)}',
            color: colors.win,
          ),
        if (cashbackCents > 0)
          line('Cashback', '− ${formatBRLFromCents(cashbackCents)}'),
        Divider(height: 8, color: colors.surfaceRaised),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                'Total',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ),
            Text(
              formatBRLFromCents(totalCents),
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Depois do QR: o desconto que o servidor aplicou nesta cobrança.
class SquadDiscountAppliedNote extends StatelessWidget {
  const SquadDiscountAppliedNote({super.key, required this.discountCents});

  final int discountCents;

  @override
  Widget build(BuildContext context) {
    if (discountCents <= 0) return const SizedBox.shrink();
    return Row(
      key: const Key('squad-discount-applied'),
      children: [
        Icon(Icons.sell_outlined, size: 16, color: context.themeColors.win),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Desconto do embaixador de ${formatBRLFromCents(discountCents)} aplicado',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}
