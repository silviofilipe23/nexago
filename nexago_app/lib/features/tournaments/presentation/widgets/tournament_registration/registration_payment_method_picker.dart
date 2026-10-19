import 'package:flutter/material.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/registration_payment_method.dart';

/// "Como você quer pagar?" — PIX ou cartão de crédito, antes de abrir a
/// cobrança. Some quando já existe uma cobrança viva: uma por vez, como no
/// portal.
class RegistrationPaymentMethodPicker extends StatelessWidget {
  const RegistrationPaymentMethodPicker({
    super.key,
    required this.value,
    required this.amountReais,
    required this.onChanged,
    this.enabled = true,
  });

  static const pixKey = Key('payment-method-pix');
  static const cardKey = Key('payment-method-card');

  final RegistrationPaymentMethod value;

  /// Valor que a cobrança vai levar (com desconto e saldo já fora).
  final double amountReais;
  final ValueChanged<RegistrationPaymentMethod> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final amount = formatBRL(amountReais);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Como você quer pagar?',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
        ),
        const SizedBox(height: 10),
        _MethodTile(
          key: pixKey,
          icon: Icons.pix_rounded,
          accent: AppColors.win,
          title: 'Pix · aprovação na hora',
          subtitle: '$amount · pagar com seu banco',
          selected: value == RegistrationPaymentMethod.pix,
          onTap: enabled
              ? () => onChanged(RegistrationPaymentMethod.pix)
              : null,
        ),
        const SizedBox(height: 10),
        _MethodTile(
          key: cardKey,
          icon: Icons.credit_card_rounded,
          accent: AppColors.brand,
          title: 'Cartão de crédito · à vista',
          subtitle: '$amount · checkout seguro do Asaas',
          selected: value == RegistrationPaymentMethod.card,
          onTap: enabled
              ? () => onChanged(RegistrationPaymentMethod.card)
              : null,
        ),
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
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback? onTap;

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
                  child: Icon(icon, color: accent, size: 24),
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
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
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
            ),
          ),
        ),
      ),
    );
  }
}
