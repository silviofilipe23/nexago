import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_now.dart';
import 'arena_now_booking_label.dart';

/// Destaque da aba Agora: a próxima reserva que vai começar.
class ArenaNowNextBookingCard extends StatelessWidget {
  const ArenaNowNextBookingCard({
    super.key,
    required this.booking,
    required this.now,
    required this.canOpen,
  });

  final ArenaManagerBooking? booking;
  final DateTime now;

  /// Quem não lê a agenda vê o card, mas não abre o detalhe.
  final bool canOpen;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    if (b == null) return const _NoNextBooking();

    final colors = context.themeColors;
    final theme = Theme.of(context);
    final payment = arenaBookingPaymentInfo(b.data);
    final eyebrow = arenaNowNextEyebrow(b, now);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: canOpen ? () => openArenaNowBooking(context, b) : null,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.brand.withValues(alpha: 0.20),
                AppColors.brand.withValues(alpha: 0.05),
              ],
            ),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.32)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: colors.brandText,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${b.startTime} · ${b.courtName}',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              ArenaNowBookingWho(
                booking: b,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _Chip(
                    label: _paymentChip(payment),
                    color: payment.accentColor,
                  ),
                  if (b.isRecurring)
                    _Chip(label: 'Mensalista', color: colors.onSurfaceMuted),
                  if (canOpen)
                    _Chip(label: 'Ver reserva ›', color: colors.brandText),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _paymentChip(ArenaBookingPaymentInfo info) {
    if (info.isPaidInFull) return 'Pago';
    if (info.isDepositOnly) return 'Sinal pago';
    if (info.isPendingPayment) return 'Aguardando pagamento';
    if (info.settlement == ArenaBookingPaymentSettlement.pendingOnsite) {
      return 'Paga no local';
    }
    return info.channel;
  }
}

/// "Próximo horário · em 18 min", "Próximo horário · hoje", "Amanhã", data.
String arenaNowNextEyebrow(ArenaManagerBooking b, DateTime now) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  final tomorrowKey = arenaDateKey(
    arenaDateOnly(now).add(const Duration(days: 1)),
  );
  if (b.dateKey == todayKey) {
    final start = arenaNowMinutes(b.startTime);
    final diff = start == null ? null : start - (now.hour * 60 + now.minute);
    if (diff != null && diff <= 60) return 'Próximo horário · em $diff min';
    return 'Próximo horário · hoje';
  }
  if (b.dateKey == tomorrowKey) return 'Próximo horário · amanhã';
  final day = DateTime.tryParse(b.dateKey);
  if (day == null) return 'Próximo horário';
  final label = DateFormat("EEE, d 'de' MMM", 'pt_BR').format(day);
  return 'Próximo horário · ${label.replaceAll('.', '')}';
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tone = context.themeColors.readableTone(color);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: tone,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _NoNextBooking extends StatelessWidget {
  const _NoNextBooking();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Icon(Icons.event_available_rounded, color: colors.onSurfaceMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Nenhuma reserva marcada daqui pra frente.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
        ],
      ),
    );
  }
}
