import 'package:flutter/material.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/registration_payment_method.dart';

/// "Como você quer pagar?" — PIX ou cartão de crédito, antes de abrir a
/// cobrança. Some quando já existe uma cobrança viva: uma por vez, como no
/// portal.
///
/// Só os meios que o organizador aceita ([methods]); com um só não há
/// escolha — o card mostra o meio e o valor, sem rádio. Com os dois e taxa
/// de antecipação no cartão, o Pix aparece como o mais barato: o total do
/// cartão riscado ao lado e o selo com a diferença (que é só a taxa).
class RegistrationPaymentMethodPicker extends StatelessWidget {
  const RegistrationPaymentMethodPicker({
    super.key,
    required this.value,
    required this.amountReais,
    required this.onChanged,
    this.methods = allRegistrationPaymentMethods,
    this.cardFeeReais = 0,
    this.cardBaseReais,
    this.enabled = true,
  });

  static const pixKey = Key('payment-method-pix');
  static const cardKey = Key('payment-method-card');
  static const pixSavingsKey = Key('payment-method-pix-savings');
  static const cardFeeNoteKey = Key('payment-method-card-fee');

  final RegistrationPaymentMethod value;

  /// Valor que a cobrança no Pix vai levar (com desconto e saldo já fora).
  final double amountReais;
  final ValueChanged<RegistrationPaymentMethod> onChanged;

  /// Meios aceitos pelo torneio, na ordem da tela.
  final List<RegistrationPaymentMethod> methods;

  /// Taxas do cartão (processamento e antecipação) que ele soma por cima de
  /// [amountReais].
  final double cardFeeReais;

  /// Base do cartão quando o Pix tem desconto (o cartão parte do valor cheio).
  /// `null` = [amountReais] (Pix e cartão partem do mesmo valor).
  final double? cardBaseReais;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final single = methods.length == 1;
    final hasCardFee = cardFeeReais > 0;
    final cardTotalReais = (cardBaseReais ?? amountReais) + cardFeeReais;
    final cardTotal = formatBRL(cardTotalReais);
    final pixSavings = ((cardTotalReais - amountReais) * 100).round() / 100;
    final showPixSavings = !single && pixSavings > 0;
    final tiles = <Widget>[
      for (final method in methods)
        switch (method) {
          RegistrationPaymentMethod.pix => _MethodTile(
              key: pixKey,
              icon: Icons.pix_rounded,
              accent: AppColors.win,
              title: 'Pix · aprovação na hora',
              subtitle: '${formatBRL(amountReais)} · pagar com seu banco',
              struckAmount: showPixSavings ? cardTotal : null,
              badge: showPixSavings
                  ? '${formatBRL(pixSavings)} a menos que no cartão'
                  : null,
              badgeKey: pixSavingsKey,
              selected: value == RegistrationPaymentMethod.pix,
              showRadio: !single,
              onTap: enabled && !single
                  ? () => onChanged(RegistrationPaymentMethod.pix)
                  : null,
            ),
          RegistrationPaymentMethod.card => _MethodTile(
              key: cardKey,
              icon: Icons.credit_card_rounded,
              accent: AppColors.brand,
              title: 'Cartão de crédito · à vista',
              subtitle: '$cardTotal · checkout seguro do Asaas',
              note: hasCardFee
                  ? 'Inclui ${formatBRL(cardFeeReais)} de taxas do cartão'
                  : null,
              noteKey: cardFeeNoteKey,
              selected: value == RegistrationPaymentMethod.card,
              showRadio: !single,
              onTap: enabled && !single
                  ? () => onChanged(RegistrationPaymentMethod.card)
                  : null,
            ),
        },
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          single ? 'Forma de pagamento' : 'Como você quer pagar?',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          tiles[i],
        ],
      ],
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    super.key,
    required this.icon,
    required this.accent,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.struckAmount,
    this.badge,
    this.badgeKey,
    this.note,
    this.noteKey,
    this.showRadio = true,
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback? onTap;

  /// Valor riscado antes do [subtitle] (o total do cartão, no Pix).
  final String? struckAmount;

  /// Selo verde abaixo do valor ("R$ 1,33 a menos que no cartão").
  final String? badge;
  final Key? badgeKey;

  /// Linha miúda abaixo do valor ("Inclui R$ 4,96 de taxas do cartão").
  final String? note;
  final Key? noteKey;

  /// Sem escolha (um meio só): o card é só informativo, sem rádio.
  final bool showRadio;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final radius = BorderRadius.circular(14);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: context.themeColors.surfaceCard,
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(
                color: selected
                    ? AppColors.brand.withValues(alpha: 0.6)
                    : context.themeColors.surfaceRaised,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    icon,
                    color: context.themeColors.readableTone(accent),
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      if (struckAmount case final struck?)
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: struck,
                                style: const TextStyle(
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                              const TextSpan(text: '  '),
                              TextSpan(
                                text: subtitle,
                                style: TextStyle(
                                  color: context.themeColors.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        )
                      else
                        Text(
                          subtitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      if (note != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          note!,
                          key: noteKey,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ],
                      if (badge != null) ...[
                        const SizedBox(height: 6),
                        _SavingsBadge(key: badgeKey, label: badge!),
                      ],
                    ],
                  ),
                ),
                if (showRadio) ...[
                  const SizedBox(width: 8),
                  Icon(
                    selected
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: selected
                        ? AppColors.brand
                        : context.themeColors.onSurfaceMuted,
                    size: 22,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Selo do Pix mais barato: a diferença para o cartão, em verde.
class _SavingsBadge extends StatelessWidget {
  const _SavingsBadge({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = context.themeColors.win;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.win.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.south_rounded, size: 13, color: color),
            const SizedBox(width: 3),
            Flexible(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
