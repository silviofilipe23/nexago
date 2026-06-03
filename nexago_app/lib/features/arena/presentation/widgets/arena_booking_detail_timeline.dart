import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingTimelineEvent {
  const ArenaBookingTimelineEvent({
    required this.title,
    required this.subtitle,
    this.isPending = false,
    this.isComplete = true,
  });

  final String title;
  final String subtitle;
  final bool isPending;
  final bool isComplete;
}

class ArenaBookingDetailTimeline extends StatelessWidget {
  const ArenaBookingDetailTimeline({
    super.key,
    required this.events,
  });

  final List<ArenaBookingTimelineEvent> events;

  static List<ArenaBookingTimelineEvent> fromBooking(
    ArenaManagerBooking booking,
    Map<String, dynamic> data,
  ) {
    final out = <ArenaBookingTimelineEvent>[];
    final created = _ts(data['createdAt']);
    if (created != null) {
      out.add(
        ArenaBookingTimelineEvent(
          title: 'Reserva criada pelo atleta (app)',
          subtitle: _fmt(created),
        ),
      );
    } else {
      out.add(
        const ArenaBookingTimelineEvent(
          title: 'Reserva criada',
          subtitle: '—',
        ),
      );
    }

    out.add(
      const ArenaBookingTimelineEvent(
        title: 'Confirmação enviada por push',
        subtitle: '—',
        isComplete: false,
      ),
    );

    final attendance =
        (data['attendanceStatus'] as String?)?.trim().toLowerCase() ?? '';
    final checkedIn = _ts(data['checkedInAt']);
    if (attendance == 'checked_in' && checkedIn != null) {
      out.add(
        ArenaBookingTimelineEvent(
          title: 'Check-in realizado',
          subtitle: _fmt(checkedIn),
        ),
      );
    } else {
      out.add(
        ArenaBookingTimelineEvent(
          title: 'Check-in pendente',
          subtitle: ArenaBookingsGrouping.checkInPendingSubtitle(booking) ??
              'Hoje',
          isPending: true,
          isComplete: false,
        ),
      );
    }

    return out;
  }

  static DateTime? _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }

  static String _fmt(DateTime d) {
    return DateFormat("d MMM · HH:mm", 'pt_BR').format(d);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (events.isEmpty) return const SizedBox.shrink();

    final pendingIndex = events.indexWhere((e) => e.isPending);

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
                    'Linha do tempo',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
                Text(
                  'STATUS',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
            SizedBox(height: 14),
            _TimelineProgressStrip(
              eventCount: events.length,
              pendingIndex: pendingIndex,
              events: events,
            ),
            SizedBox(height: 18),
            for (var i = 0; i < events.length; i++)
              _TimelineRow(
                event: events[i],
                isLast: i == events.length - 1,
                isDone: pendingIndex < 0 || i < pendingIndex,
              ),
          ],
        ),
      ),
    );
  }
}

class _TimelineProgressStrip extends StatelessWidget {
  const _TimelineProgressStrip({
    required this.eventCount,
    required this.pendingIndex,
    required this.events,
  });

  final int eventCount;
  final int pendingIndex;
  final List<ArenaBookingTimelineEvent> events;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < eventCount; i++) ...[
          if (i > 0) SizedBox(width: 6),
          Expanded(
            child: _ProgressSegment(
              state: _stateFor(i),
            ),
          ),
        ],
      ],
    );
  }

  _SegmentState _stateFor(int index) {
    if (pendingIndex < 0) {
      return events[index].isComplete
          ? _SegmentState.done
          : _SegmentState.upcoming;
    }
    if (index < pendingIndex) return _SegmentState.done;
    if (index == pendingIndex) return _SegmentState.pending;
    return _SegmentState.upcoming;
  }
}

enum _SegmentState { done, pending, upcoming }

class _ProgressSegment extends StatelessWidget {
  const _ProgressSegment({required this.state});

  final _SegmentState state;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 8,
      decoration: BoxDecoration(
        color: switch (state) {
          _SegmentState.done => AppColors.brand,
          _SegmentState.pending => AppColors.pending.withValues(alpha: 0.22),
          _SegmentState.upcoming => Colors.transparent,
        },
        borderRadius: BorderRadius.circular(4),
        border: switch (state) {
          _SegmentState.upcoming => Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
              width: 1.5,
            ),
          _SegmentState.pending => Border.all(
              color: AppColors.pending.withValues(alpha: 0.45),
              width: 1.5,
            ),
          _SegmentState.done => null,
        },
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.event,
    required this.isLast,
    required this.isDone,
  });

  final ArenaBookingTimelineEvent event;
  final bool isLast;
  final bool isDone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dotColor = event.isPending
        ? AppColors.pending
        : isDone
            ? AppColors.win
            : context.themeColors.onSurfaceMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 12,
            child: Column(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  margin: EdgeInsets.only(top: event.isPending ? 18 : 5),
                  decoration: BoxDecoration(
                    color: dotColor,
                    shape: BoxShape.circle,
                    boxShadow: isDone && !event.isPending
                        ? [
                            BoxShadow(
                              color: AppColors.win.withValues(alpha: 0.35),
                              blurRadius: 6,
                            ),
                          ]
                        : null,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: context.themeColors.surfaceRaised,
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
              child: event.isPending
                  ? _PendingEventBody(event: event)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.title,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                        if (event.subtitle != '—') ...[
                          SizedBox(height: 2),
                          Text(
                            event.subtitle,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingEventBody extends StatelessWidget {
  const _PendingEventBody({required this.event});

  final ArenaBookingTimelineEvent event;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.pending.withValues(alpha: 0.3),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.schedule_rounded,
                size: 20,
                color: AppColors.brand,
              ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.title,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    event.subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.pending,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
