import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_booking_card_pills.dart';
import '../../domain/arena_booking_day_timeline.dart';
import '../../domain/arena_booking_journey.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import '../../domain/arena_manager_booking.dart';
import 'arena_booking_card.dart';
import 'arena_dashboard_tokens.dart';

const double _ringSize = 84;
const double _ringStroke = 7;

/// Topo do detalhe da reserva: anel com o tempo (restante, até começar ou
/// concluído), o horário, quem joga e onde.
class ArenaBookingLiveHero extends StatelessWidget {
  const ArenaBookingLiveHero({
    super.key,
    required this.booking,
    required this.journey,
    required this.whoLabel,
  });

  final ArenaManagerBooking booking;
  final ArenaBookingJourney journey;

  /// Atleta dono, nome do cliente de balcão ou "Sem atleta".
  final String whoLabel;

  bool get _isLive =>
      !journey.isCanceled && journey.moment.phase == ArenaTimelinePhase.live;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final decoration = ArenaDashboardTokens.cardDecoration(context);
    final sport = arenaBookingSportLabel(booking.data);
    final place = [
      booking.courtName,
      if (sport != null) sport,
      ArenaBookingsGrouping.displayCode(booking.id),
    ].join(' · ');
    final typePills = arenaBookingTypePills(booking)
        .where((p) => p.kind != ArenaPillKind.canceled)
        .toList();
    final professorDiscount = arenaBookingProfessorDiscountLabel(booking.data);

    return DecoratedBox(
      key: const Key('arena-booking-live-hero'),
      decoration: _isLive
          ? decoration.copyWith(
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.6),
                width: 1.4,
              ),
            )
          : decoration,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _TimeRing(journey: journey, booking: booking),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ArenaBookingPillChip(_statusPill(journey)),
                      const SizedBox(height: 8),
                      Text(
                        '${booking.startTime} – ${booking.endTime}',
                        semanticsLabel:
                            'Das ${booking.startTime} às ${booking.endTime}',
                        style: AppTypography.mono(
                          fontSize: 22,
                          color: colors.onSurface,
                          letterSpacing: -0.4,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        whoLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        place,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (typePills.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final p in typePills)
                    // Reservada como professor: a arena vê que o horário é
                    // de aula dele (vínculo com "Reservar quadras").
                    p.kind == ArenaPillKind.professor
                        ? KeyedSubtree(
                            key: const Key('arena-booking-professor'),
                            child: ArenaBookingPillChip(p),
                          )
                        : ArenaBookingPillChip(p),
                ],
              ),
            ],
            if (professorDiscount != null) ...[
              const SizedBox(height: 6),
              Text(
                professorDiscount,
                key: const Key('arena-booking-professor-discount'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

ArenaBookingPill _statusPill(ArenaBookingJourney j) {
  if (j.isCanceled) {
    return const ArenaBookingPill(
      'Cancelada',
      ArenaPillTone.live,
      ArenaPillKind.canceled,
    );
  }
  return switch (j.moment.phase) {
    ArenaTimelinePhase.live => const ArenaBookingPill(
        'Ao vivo',
        ArenaPillTone.brand,
        ArenaPillKind.live,
      ),
    ArenaTimelinePhase.done => const ArenaBookingPill(
        'Encerrada',
        ArenaPillTone.muted,
        ArenaPillKind.paid,
      ),
    ArenaTimelinePhase.upcoming => ArenaBookingPill(
        j.moment.isToday ? 'Hoje' : 'Agendada',
        ArenaPillTone.muted,
        ArenaPillKind.checkInPending,
      ),
  };
}

/// Anel do tempo: progresso da hora em quadra, com o número no meio.
class _TimeRing extends StatelessWidget {
  const _TimeRing({required this.journey, required this.booking});

  final ArenaBookingJourney journey;
  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final phase = journey.moment.phase;
    final value = journey.isCanceled
        ? 0.0
        : switch (phase) {
            ArenaTimelinePhase.live => journey.moment.progress,
            ArenaTimelinePhase.done => 1.0,
            ArenaTimelinePhase.upcoming => 0.0,
          };
    final ringColor =
        phase == ArenaTimelinePhase.done ? colors.win : AppColors.brand;

    return SizedBox(
      key: const Key('arena-booking-time-ring'),
      width: _ringSize,
      height: _ringSize,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: CircularProgressIndicator(
              value: value,
              strokeWidth: _ringStroke,
              strokeCap: StrokeCap.round,
              color: ringColor,
              backgroundColor: colors.surfaceRaised,
            ),
          ),
          _RingCenter(journey: journey, booking: booking),
        ],
      ),
    );
  }
}

class _RingCenter extends StatelessWidget {
  const _RingCenter({required this.journey, required this.booking});

  final ArenaBookingJourney journey;
  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (journey.isCanceled) {
      return Icon(Icons.close_rounded, size: 30, color: colors.live);
    }
    final moment = journey.moment;
    final until = journey.minutesUntilStart;
    final (big, small, semantics) = switch (moment.phase) {
      ArenaTimelinePhase.live => (
          '${moment.minutesLeft ?? 0}',
          'min',
          'Faltam ${moment.minutesLeft ?? 0} minutos',
        ),
      ArenaTimelinePhase.upcoming when until != null => (
          _compact(until),
          until < 60 ? 'min p/ início' : 'p/ início',
          'Começa em ${arenaMinutesLabel(until)}',
        ),
      ArenaTimelinePhase.upcoming => _dayLabel(booking.dateKey),
      ArenaTimelinePhase.done => ('', '', 'Reserva encerrada'),
    };
    if (moment.phase == ArenaTimelinePhase.done) {
      return Semantics(
        label: semantics,
        child: Icon(Icons.check_rounded, size: 32, color: colors.win),
      );
    }
    return Semantics(
      label: semantics,
      excludeSemantics: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            big,
            style: AppTypography.mono(
              fontSize: 22,
              color: colors.onSurface,
              height: 1,
            ),
          ),
          Text(
            small,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }

  /// "48" para minutos; "2h" / "2h30" acima de uma hora.
  static String _compact(int minutes) =>
      minutes < 60 ? '$minutes' : arenaMinutesLabel(minutes);

  static (String, String, String) _dayLabel(String dateKey) {
    final d = DateTime.tryParse(dateKey.length >= 10 ? dateKey : '');
    if (d == null) return ('—', '', 'Data não informada');
    final month = DateFormat('MMM', 'pt_BR').format(d).replaceAll('.', '');
    return (
      '${d.day}',
      month,
      DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(d),
    );
  }
}
