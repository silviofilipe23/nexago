import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_booking_journey.dart';
import '../../domain/arena_booking_labels.dart';
import 'arena_dashboard_tokens.dart';

/// Conta da quadra: a hora e o consumo da comanda num total só, o que já
/// foi pago (online e no balcão) e quanto falta receber.
class ArenaBookingCourtBill extends StatelessWidget {
  const ArenaBookingCourtBill({
    super.key,
    required this.bill,
    required this.bookingData,
    required this.timeRange,
    this.onAddConsumption,
  });

  final ArenaBookingBill bill;
  final Map<String, dynamic> bookingData;

  /// "17:00–18:00", na linha da hora.
  final String timeRange;

  /// Nulo esconde "Adicionar consumo" (papel sem escrita em comandas).
  final VoidCallback? onAddConsumption;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final info = arenaBookingPaymentInfo(bookingData);
    final coupon = arenaBookingCouponInfo(bookingData);
    final hour = bill.hourReais;
    final count = bill.consumptionCount;

    return DecoratedBox(
      key: const Key('arena-booking-court-bill'),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Conta da quadra',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  formatBRL(bill.totalReais),
                  key: const Key('arena-booking-bill-total'),
                  style: AppTypography.mono(
                    fontSize: 16,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _Line(
              label: 'Hora · $timeRange',
              value: hour != null ? formatBRL(hour) : '—',
            ),
            if (coupon != null && coupon.discountReais > 0)
              _Line(
                label: 'Cupom ${coupon.code} aplicado',
                value: '-${formatBRL(coupon.discountReais)}',
                color: colors.brandText,
              ),
            _Line(
              label: count == 0
                  ? 'Consumo'
                  : 'Consumo · $count ${count == 1 ? 'item' : 'itens'}',
              value: bill.consumptionReais > 0
                  ? formatBRL(bill.consumptionReais)
                  : 'R\$ 0,00',
              muted: bill.consumptionReais <= 0,
            ),
            if (bill.paidOnlineReais > 0)
              _Line(
                label: 'Pago online (${info.channel})',
                value: '-${formatBRL(bill.paidOnlineReais)}',
                color: colors.win,
              ),
            if (bill.paidAtArenaReais > 0)
              _Line(
                label: 'Recebido no balcão',
                value: '-${formatBRL(bill.paidAtArenaReais)}',
                color: colors.win,
              ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Divider(height: 1, color: colors.surfaceRaised),
            ),
            _DueRow(bill: bill, info: info),
            if (onAddConsumption != null) ...[
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const Key('arena-booking-bill-add-consumption'),
                  onPressed: onAddConsumption,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Adicionar consumo'),
                  style: TextButton.styleFrom(
                    foregroundColor: colors.brandText,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    textStyle: const TextStyle(
                      fontFamily: AppTypography.fontFamily,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DueRow extends StatelessWidget {
  const _DueRow({required this.bill, required this.info});

  final ArenaBookingBill bill;
  final ArenaBookingPaymentInfo info;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (label, value, color) = bill.hasDue
        ? ('Falta receber', formatBRL(bill.dueReais), colors.pending)
        : bill.isSettled
            ? ('Tudo pago', formatBRL(0), colors.win)
            : info.isPendingPayment
                ? ('Aguardando pagamento online', '—', colors.pending)
                : ('Nada a receber', '—', colors.onSurfaceMuted);
    return Row(
      key: const Key('arena-booking-bill-due'),
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ),
        Text(
          value,
          style: AppTypography.mono(fontSize: 20, color: color),
        ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.label,
    required this.value,
    this.color,
    this.muted = false,
  });

  final String label;
  final String value;
  final Color? color;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ink = color ?? (muted ? colors.onSurfaceMuted : colors.onSurface);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: color ?? colors.onSurfaceMuted,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            value,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: ink,
            ),
          ),
        ],
      ),
    );
  }
}
