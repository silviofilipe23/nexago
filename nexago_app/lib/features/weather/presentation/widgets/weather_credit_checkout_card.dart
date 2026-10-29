import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../weather_ui.dart';

/// A5 — "Usar crédito de chuva" na confirmação da reserva. Controlado: a
/// página guarda o valor (começa LIGADO) e recota com `useWeatherCredit`.
/// Só aparece quando a cotação devolve saldo nesta arena.
class WeatherCreditCheckoutCard extends StatelessWidget {
  const WeatherCreditCheckoutCard({
    super.key,
    required this.availableReais,
    required this.nextExpiresAt,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  static const Key switchKey = ValueKey('checkout-weather-credit-switch');

  final double availableReais;
  final DateTime? nextExpiresAt;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (availableReais <= 0) return const SizedBox.shrink();
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final expiry = nextExpiresAt == null
        ? 'sem validade'
        : 'vence ${WeatherCopy.dayShortMonth(nextExpiresAt!)}';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: value ? 0.06 : 0.0),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: value
              ? AppColors.win.withValues(alpha: 0.35)
              : colors.onSurface.withValues(alpha: 0.10),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          WeatherIconTile(
            size: 40,
            radius: 11,
            background: AppColors.win.withValues(alpha: 0.14),
            child: Icon(
              Icons.account_balance_wallet_outlined,
              size: 19,
              color: colors.win,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Usar crédito de chuva',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Saldo ${WeatherCopy.money(availableReais)} · $expiry',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            key: switchKey,
            value: value,
            onChanged: enabled ? onChanged : null,
            // Laranja da marca, como o `WxToggle on` do design.
            activeTrackColor: AppColors.brand,
            activeThumbColor: AppColors.black,
          ),
        ],
      ),
    );
  }
}
