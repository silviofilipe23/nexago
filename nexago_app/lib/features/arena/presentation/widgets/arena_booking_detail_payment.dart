import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingDetailPayment extends StatelessWidget {
  const ArenaBookingDetailPayment({
    super.key,
    required this.bookingData,
    required this.amountStr,
    required this.startTime,
    required this.endTime,
    this.amountReais,
  });

  final Map<String, dynamic>? bookingData;
  final String amountStr;
  final String startTime;
  final String endTime;
  final double? amountReais;

  static final _currency = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 2,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final payment = arenaBookingPaymentInfo(bookingData);
    final hours = ArenaBookingsGrouping.bookingDurationHours(
      startTime,
      endTime,
    );
    String? rateLine;
    if (hours != null && hours > 0 && amountReais != null && amountReais! > 0) {
      final durationLabel = ArenaBookingsGrouping.formatDurationLabel(hours);
      final hourly = amountReais! / hours;
      final hourlyStr = _currency.format(hourly);
      rateLine = '· $durationLabel x $hourlyStr/h';
    }

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    'Pagamento',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
                _PaymentStatusBadge(info: payment),
              ],
            ),
            SizedBox(height: 12),
            _PaymentStatusBanner(info: payment),
            SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  amountStr,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: payment.isPaidOnline
                        ? payment.accentColor
                        : AppColors.brand,
                    height: 1,
                    letterSpacing: -0.5,
                  ),
                ),
                if (rateLine != null) ...[
                  SizedBox(width: 10),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      rateLine,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                ],
              ],
            ),
            if (payment.isDepositOnly &&
                (payment.paidOnlineReais != null || payment.dueOnsiteReais != null)) ...[
              SizedBox(height: 14),
              _PaymentBreakdown(info: payment),
            ] else if (payment.isPaidInFull &&
                payment.paidOnlineReais != null &&
                payment.paidOnlineReais! > 0) ...[
              SizedBox(height: 10),
              Text(
                'Recebido via PIX: ${_currency.format(payment.paidOnlineReais!)}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.win,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            SizedBox(height: 10),
            Text(
              'Forma: ${payment.channel}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentStatusBanner extends StatelessWidget {
  const _PaymentStatusBanner({required this.info});

  final ArenaBookingPaymentInfo info;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = info.accentColor;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(info.statusIcon, size: 22, color: color),
            SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    info.headline,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w800,
                      height: 1.3,
                    ),
                  ),
                  if (info.subheadline != null) ...[
                    SizedBox(height: 4),
                    Text(
                      info.subheadline!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentBreakdown extends StatelessWidget {
  const _PaymentBreakdown({required this.info});

  final ArenaBookingPaymentInfo info;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final paid = info.paidOnlineReais;
    final due = info.dueOnsiteReais;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (paid != null && paid > 0)
          _BreakdownRow(
            icon: Icons.check_circle_rounded,
            iconColor: AppColors.brand,
            label: 'Sinal PIX (já pago)',
            value: NumberFormat.currency(locale: 'pt_BR', symbol: r'R$')
                .format(paid),
            valueColor: AppColors.brand,
          ),
        if (due != null && due > 0.02) ...[
          SizedBox(height: 8),
          _BreakdownRow(
            icon: Icons.storefront_rounded,
            iconColor: AppColors.pending,
            label: 'Restante na chegada',
            value: NumberFormat.currency(locale: 'pt_BR', symbol: r'R$')
                .format(due),
            valueColor: AppColors.pending,
          ),
        ],
        if (info.totalReais != null) ...[
          SizedBox(height: 8),
          Text(
            'Total da reserva: ${NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(info.totalReais!)}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: iconColor),
        SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}

class _PaymentStatusBadge extends StatelessWidget {
  const _PaymentStatusBadge({required this.info});

  final ArenaBookingPaymentInfo info;

  @override
  Widget build(BuildContext context) {
    final color = info.accentColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        info.statusBadge,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 10,
          letterSpacing: 0.4,
          fontFamily: 'monospace',
        ),
      ),
    );
  }
}
