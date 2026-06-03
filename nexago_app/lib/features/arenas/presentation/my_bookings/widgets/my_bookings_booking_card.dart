import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_booking_guests_providers.dart';
import '../../../domain/my_booking_item.dart';
import '../my_bookings_logic.dart';
import '../my_bookings_status.dart';
import 'my_bookings_payment_chip.dart';

class MyBookingsBookingCard extends ConsumerStatefulWidget {
  const MyBookingsBookingCard({
    super.key,
    required this.item,
    required this.sportLabel,
    required this.onTap,
  });

  final MyBookingItem item;
  final String sportLabel;
  final VoidCallback onTap;

  @override
  ConsumerState<MyBookingsBookingCard> createState() =>
      _MyBookingsBookingCardState();
}

class _MyBookingsBookingCardState extends ConsumerState<MyBookingsBookingCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = myBookingStatusUi(widget.item.rawStatus);
    final court = widget.item.courtName?.trim();
    final subtitle = court != null && court.isNotEmpty
        ? '$court · ${widget.sportLabel}'
        : widget.sportLabel;
    final guestsAsync = ref.watch(myBookingGuestDisplaysProvider(widget.item));

    return AnimatedScale(
      scale: _pressed ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          onHighlightChanged: (v) => setState(() => _pressed = v),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.1),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _TimeColumn(
                  start: widget.item.startTime,
                  end: widget.item.endTime,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              widget.item.arenaName,
                              style: AppTypography.soraRegular(
                                fontWeight: FontWeight.w700,
                                color: context.themeColors.onSurface,
                                fontSize: 14,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          SizedBox(width: 8),
                          MyBookingStatusBadge(ui: status),
                        ],
                      ),
                      SizedBox(height: 6),
                      Text(
                        subtitle,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      SizedBox(height: 8),
                      MyBookingsPaymentChip(payment: widget.item.paymentDisplay),
                      guestsAsync.when(
                        data: (guests) {
                          if (guests.isEmpty) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: _ConfirmedGuestRow(guest: guests.first),
                          );
                        },
                        loading: () => SizedBox(
                          height: 32,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        ),
                        error: (_, __) => const SizedBox.shrink(),
                      ),
                      SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          formatPriceReais(widget.item.amountReais),
                          style: AppTypography.mono(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                    ],
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

class _ConfirmedGuestRow extends StatelessWidget {
  const _ConfirmedGuestRow({required this.guest});

  final MyBookingGuestDisplay guest;

  @override
  Widget build(BuildContext context) {
    final initials = arenaInitials(guest.displayName);

    return Row(
      children: [
        CircleAvatar(
          radius: 14,
          backgroundColor: AppColors.win.withValues(alpha: 0.22),
          backgroundImage:
              guest.avatarUrl != null && guest.avatarUrl!.isNotEmpty
                  ? NetworkImage(guest.avatarUrl!)
                  : null,
          child: guest.avatarUrl == null || guest.avatarUrl!.isEmpty
              ? Text(
                  initials,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.win,
                  ),
                )
              : null,
        ),
        SizedBox(width: 8),
        Text(
          'com ${guest.shortLabel}',
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurface,
          ),
        ),
      ],
    );
  }
}

class _TimeColumn extends StatelessWidget {
  const _TimeColumn({required this.start, required this.end});

  final String start;
  final String end;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(
            start,
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Text(
              '—',
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Text(
            end,
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
