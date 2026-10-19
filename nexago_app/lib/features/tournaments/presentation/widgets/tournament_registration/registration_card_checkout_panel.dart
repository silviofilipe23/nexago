import 'package:flutter/material.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cobrança de cartão viva: o pagamento acontece no checkout HOSPEDADO do
/// Asaas, aberto no navegador do app. Daqui o atleta só (re)abre o link — a
/// confirmação chega pelo doc da inscrição, como no PIX.
class RegistrationCardCheckoutPanel extends StatelessWidget {
  const RegistrationCardCheckoutPanel({
    super.key,
    required this.amountReais,
    required this.onOpen,
  });

  static const openKey = Key('card-checkout-open');

  /// O que o cartão cobra (preço − desconto − saldo).
  final double amountReais;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.credit_card_rounded,
                  color: AppColors.brand,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cartão de crédito · à vista',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      formatBRL(amountReais),
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              key: openKey,
              onPressed: onOpen,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              icon: const Icon(Icons.lock_rounded, size: 18),
              label: const Text(
                'Abrir pagamento seguro',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Icon(
                  Icons.verified_user_outlined,
                  size: 16,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'O pagamento acontece no ambiente do Asaas — seus dados de '
                  'cartão não passam pelo nexaGO.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
