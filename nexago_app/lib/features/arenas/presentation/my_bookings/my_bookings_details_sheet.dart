import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/my_booking_item.dart';
import 'my_bookings_status.dart';

class BookingDetailsSheet extends StatelessWidget {
  const BookingDetailsSheet({
    super.key,
    required this.item,
    required this.dateLabel,
    required this.onOpenMaps,
    required this.onPayNow,
    required this.onCancelBooking,
    required this.canCancelBooking,
  });

  final MyBookingItem item;
  final String dateLabel;
  final VoidCallback onOpenMaps;
  final VoidCallback onPayNow;
  final VoidCallback onCancelBooking;
  final bool canCancelBooking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = myBookingStatusUi(item.rawStatus);
    final canPayNow = item.rawStatus.trim().toLowerCase() == 'pending';

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: BoxDecoration(
          color: context.themeColors.surfaceSheet,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.arenaName,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.2,
                  ),
                ),
                if (item.courtName != null && item.courtName!.isNotEmpty) ...[
                  SizedBox(height: 4),
                  Text(
                    item.courtName!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
                SizedBox(height: 14),
                _MetaRow(icon: Icons.calendar_today_outlined, text: dateLabel),
                SizedBox(height: 8),
                _MetaRow(
                  icon: Icons.schedule_rounded,
                  text: '${item.startTime} – ${item.endTime}',
                  mono: true,
                ),
                SizedBox(height: 8),
                _MetaRow(
                  icon: Icons.account_balance_wallet_outlined,
                  text: item.paymentDisplay.label,
                ),
                if (item.couponCode != null) ...[
                  SizedBox(height: 8),
                  _MetaRow(
                    icon: Icons.local_offer_outlined,
                    text:
                        'Cupom ${item.couponCode} (-${formatBRL(item.couponDiscountReais ?? 0)})',
                  ),
                ],
                SizedBox(height: 8),
                Row(
                  children: [
                    MyBookingStatusBadge(ui: status),
                    SizedBox(width: 10),
                    Expanded(
                      child: BookingLiveStatus(
                        dateRaw: item.dateRaw,
                        startTime: item.startTime,
                        endTime: item.endTime,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onOpenMaps,
                        icon: Icon(Icons.navigation_rounded),
                        label: Text('Como chegar'),
                      ),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: canPayNow ? onPayNow : null,
                        icon: Icon(Icons.payment_rounded),
                        label: Text('Pagar agora'),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: TextButton.icon(
                    onPressed: canCancelBooking ? onCancelBooking : null,
                    icon: Icon(Icons.cancel_outlined),
                    label: Text('Cancelar reserva'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.text,
    this.mono = false,
  });

  final IconData icon;
  final String text;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = mono
        ? AppTypography.mono(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurface.withValues(alpha: 0.9),
          )
        : theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurface.withValues(alpha: 0.88),
            height: 1.35,
            fontWeight: FontWeight.w500,
          );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: context.themeColors.onSurfaceMuted),
        SizedBox(width: 8),
        Expanded(child: Text(text, style: style)),
      ],
    );
  }
}

enum _LiveBookingState { ongoing, future, finished, unknown }

class BookingLiveStatus extends StatefulWidget {
  const BookingLiveStatus({
    super.key,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
  });

  final String dateRaw;
  final String startTime;
  final String endTime;

  @override
  State<BookingLiveStatus> createState() => _BookingLiveStatusState();
}

class _BookingLiveStatusState extends State<BookingLiveStatus> {
  Timer? _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final range = _buildRange(widget.dateRaw, widget.startTime, widget.endTime);
    if (range == null) return const SizedBox.shrink();

    final start = range.$1;
    final end = range.$2;
    final state = _stateFor(_now, start, end);
    switch (state) {
      case _LiveBookingState.ongoing:
        return _LiveChip(
          text: 'Em andamento',
          fg: AppColors.win,
          bg: AppColors.win.withValues(alpha: 0.12),
        );
      case _LiveBookingState.future:
        final diff = start.difference(_now);
        final urgent = diff.inMinutes <= 10;
        return _LiveChip(
          text: _formatCountdown(diff),
          fg: urgent ? AppColors.brand : const Color(0xFF5B9FFF),
          bg: (urgent ? AppColors.brand : const Color(0xFF5B9FFF))
              .withValues(alpha: 0.12),
        );
      case _LiveBookingState.finished:
        return _LiveChip(
          text: 'Finalizado',
          fg: context.themeColors.onSurfaceMuted,
          bg: context.themeColors.surfaceRaised,
        );
      case _LiveBookingState.unknown:
        return const SizedBox.shrink();
    }
  }

  (DateTime, DateTime)? _buildRange(String rawDate, String rawStart, String rawEnd) {
    if (rawDate.length < 10) return null;
    final date = DateTime.tryParse(rawDate.substring(0, 10));
    if (date == null) return null;
    final sm = _toMinutes(rawStart);
    final em = _toMinutes(rawEnd);
    if (sm == null || em == null) return null;
    final start = DateTime(date.year, date.month, date.day, sm ~/ 60, sm % 60);
    final end = DateTime(date.year, date.month, date.day, em ~/ 60, em % 60);
    return (start, end);
  }

  int? _toMinutes(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return null;
    return h * 60 + m;
  }

  _LiveBookingState _stateFor(DateTime now, DateTime start, DateTime end) {
    if (!now.isBefore(start) && !now.isAfter(end)) {
      return _LiveBookingState.ongoing;
    }
    if (now.isBefore(start)) return _LiveBookingState.future;
    if (now.isAfter(end)) return _LiveBookingState.finished;
    return _LiveBookingState.unknown;
  }

  String _formatCountdown(Duration d) {
    if (d.inSeconds <= 59) return 'Começando agora';
    if (d.inMinutes < 60) return 'Começa em ${d.inMinutes}min';
    final h = d.inHours;
    final min = d.inMinutes.remainder(60);
    if (min == 0) return 'Começa em ${h}h';
    return 'Começa em ${h}h ${min}min';
  }
}

class _LiveChip extends StatelessWidget {
  const _LiveChip({
    required this.text,
    required this.fg,
    required this.bg,
  });

  final String text;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }
}
