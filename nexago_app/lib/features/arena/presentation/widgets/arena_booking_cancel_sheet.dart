import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../arenas/domain/arena_booking_cancel_reason.dart';
import '../../../arenas/domain/booking_providers.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';

/// Bottom sheet para cancelar reserva (mock 05).
class ArenaBookingCancelSheet extends ConsumerStatefulWidget {
  const ArenaBookingCancelSheet({
    super.key,
    required this.booking,
    required this.arenaId,
    required this.athleteName,
  });

  final ArenaManagerBooking booking;
  final String arenaId;
  final String athleteName;

  static Future<ArenaBookingCancelReason?> show(
    BuildContext context, {
    required ArenaManagerBooking booking,
    required String arenaId,
    required String athleteName,
  }) {
    return showModalBottomSheet<ArenaBookingCancelReason>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => ArenaBookingCancelSheet(
        booking: booking,
        arenaId: arenaId,
        athleteName: athleteName,
      ),
    );
  }

  @override
  ConsumerState<ArenaBookingCancelSheet> createState() =>
      _ArenaBookingCancelSheetState();
}

class _ArenaBookingCancelSheetState
    extends ConsumerState<ArenaBookingCancelSheet> {
  ArenaBookingCancelReason _reason = ArenaBookingCancelReason.athleteRequest;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final summaryMeta = _bookingSummaryMeta(widget.booking);
    final amount = ArenaBookingsGrouping.amountReais(widget.booking.data);
    final amountStr = amount != null
        ? NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(amount)
        : '—';
    final payment = arenaBookingPaymentLabel(widget.booking.data);
    final isDirect = payment.toLowerCase().contains('direto');
    final reasons = ArenaBookingCancelReason.values;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            SizedBox(height: 18),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.live.withValues(alpha: 0.55),
                    ),
                  ),
                  child: Icon(
                    Icons.warning_amber_rounded,
                    color: AppColors.live,
                    size: 24,
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Cancelar reserva?',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          height: 1.2,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Notifica ${widget.athleteName} · libera o slot na agenda.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: 18),
            DecoratedBox(
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            widget.athleteName,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                            ),
                          ),
                        ),
                        Text(
                          amountStr,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.brand,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 8),
                    Text(
                      summaryMeta,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: 22),
            Text(
              'MOTIVO',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                fontSize: 10,
              ),
            ),
            SizedBox(height: 10),
            Column(
              children: [
                for (var row = 0; row < (reasons.length / 2).ceil(); row++) ...[
                  if (row > 0) SizedBox(height: 8),
                  Row(
                    children: [
                      for (var col = 0; col < 2; col++) ...[
                        if (col > 0) SizedBox(width: 8),
                        Expanded(
                          child: row * 2 + col < reasons.length
                              ? _ReasonOption(
                                  label: reasons[row * 2 + col].displayLabel,
                                  selected:
                                      _reason == reasons[row * 2 + col],
                                  onTap: () => setState(
                                    () => _reason = reasons[row * 2 + col],
                                  ),
                                )
                              : const SizedBox.shrink(),
                        ),
                      ],
                    ],
                  ),
                ],
              ],
            ),
            if (isDirect) ...[
              SizedBox(height: 16),
              _DirectPaymentNotice(),
            ],
            SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      foregroundColor: context.themeColors.onSurface,
                      side: BorderSide(
                        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Voltar',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _confirm,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.live,
                      foregroundColor: AppColors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _busy
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.white,
                            ),
                          )
                        : Text(
                            'Cancelar reserva',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirm() async {
    setState(() => _busy = true);
    try {
      await ref.read(bookingServiceProvider).cancelBookingByArenaManager(
            bookingId: widget.booking.id,
            arenaId: widget.arenaId,
            cancelReason: _reason.firestoreValue,
          );
      if (!mounted) return;
      Navigator.pop(context, _reason);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

String _bookingSummaryMeta(ArenaManagerBooking booking) {
  final d = DateTime.tryParse(
    booking.dateKey.length >= 10 ? booking.dateKey.substring(0, 10) : '',
  );
  final weekday = d != null
      ? DateFormat('EEE', 'pt_BR').format(d).replaceAll('.', '').toUpperCase()
      : '';
  final dayMonth = d != null
      ? DateFormat('d MMM', 'pt_BR').format(d).replaceAll('.', '').toUpperCase()
      : booking.dateKey;
  final timeRange =
      '${_hourLabel(booking.startTime)}–${_hourLabel(booking.endTime)}';
  final court = _courtShortLabel(booking.courtName);
  return '$weekday · $dayMonth · $timeRange · $court';
}

String _hourLabel(String time) {
  final parts = time.split(':');
  if (parts.isEmpty) return time;
  final h = int.tryParse(parts.first);
  if (h == null) return time;
  return '${h}H';
}

String _courtShortLabel(String courtName) {
  final trimmed = courtName.trim();
  if (trimmed.isEmpty) return '—';
  final match = RegExp(r'(\d+)').firstMatch(trimmed);
  if (match != null) {
    return 'Q${match.group(1)}';
  }
  if (trimmed.length <= 4) return trimmed.toUpperCase();
  return trimmed.toUpperCase();
}

class _ReasonOption extends StatelessWidget {
  const _ReasonOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: selected
                ? Border.all(color: AppColors.brand, width: 1.5)
                : null,
          ),
          child: Row(
            children: [
              _ReasonRadio(selected: selected),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    height: 1.25,
                    color: selected ? AppColors.brand : context.themeColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReasonRadio extends StatelessWidget {
  const _ReasonRadio({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55),
            width: 1.5,
          ),
        ),
        child: selected
            ? Center(
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
              )
            : null,
      ),
    );
  }
}

class _DirectPaymentNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.pending.withValues(alpha: 0.45),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 20,
            color: AppColors.pending.withValues(alpha: 0.95),
          ),
          SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                  height: 1.45,
                ),
                children: [
                  const TextSpan(
                    text:
                        'Pagamento direto · não há reembolso online a processar. ',
                  ),
                  TextSpan(
                    text: 'Resolva com o atleta presencialmente.',
                    style: TextStyle(
                      color: AppColors.pending.withValues(alpha: 0.95),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
