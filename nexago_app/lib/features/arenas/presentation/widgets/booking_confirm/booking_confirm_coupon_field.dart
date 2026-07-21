import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Campo de cupom de desconto no checkout — espelha `arena-payment.component.ts`
/// (Angular athlete): digitar código + "Aplicar"; quando aplicado, mostra um
/// chip com o desconto e opção de remover. Erro de cupom nunca bloqueia a
/// reserva, só aparece perto do campo (ver `_applyCoupon` na página de confirmação).
class BookingConfirmCouponField extends StatelessWidget {
  const BookingConfirmCouponField({
    super.key,
    required this.controller,
    required this.applying,
    required this.appliedCode,
    required this.discountReais,
    required this.errorText,
    required this.enabled,
    required this.onApply,
    required this.onRemove,
  });

  final TextEditingController controller;
  final bool applying;
  final String? appliedCode;
  final double discountReais;
  final String? errorText;
  final bool enabled;
  final VoidCallback onApply;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final code = appliedCode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'CUPOM DE DESCONTO (OPCIONAL)',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        if (code != null)
          _AppliedCouponChip(
            code: code,
            discountReais: discountReais,
            onRemove: onRemove,
          )
        else
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: enabled && !applying,
                  textCapitalization: TextCapitalization.characters,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurface,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Ex: VERAO10',
                    hintStyle: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.7,
                      ),
                    ),
                    filled: true,
                    fillColor: context.themeColors.surfaceRaised,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: AppColors.brand.withValues(alpha: 0.6),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
              SizedBox(width: 10),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: enabled && !applying ? onApply : null,
                  child: applying
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.black,
                          ),
                        )
                      : Text('Aplicar'),
                ),
              ),
            ],
          ),
        if (errorText != null) ...[
          SizedBox(height: 8),
          Text(
            errorText!,
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.live),
          ),
        ],
      ],
    );
  }
}

class _AppliedCouponChip extends StatelessWidget {
  const _AppliedCouponChip({
    required this.code,
    required this.discountReais,
    required this.onRemove,
  });

  final String code;
  final double discountReais;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: AppColors.brand.withValues(alpha: 0.1),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.local_offer_rounded, size: 18, color: AppColors.brand),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Cupom $code aplicado (-${formatBRL(discountReais)})',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          TextButton(onPressed: onRemove, child: Text('Remover')),
        ],
      ),
    );
  }
}
