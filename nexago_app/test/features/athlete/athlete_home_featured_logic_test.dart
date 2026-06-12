import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_featured_logic.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  final now = DateTime(2026, 6, 9, 14);

  MyTournamentRegistration tournamentReg({
    required String id,
    required DateTime start,
    DateTime? end,
    TournamentListingStatus? listingStatus,
  }) {
    return MyTournamentRegistration(
      registrationId: 'reg-$id',
      tournamentId: id,
      tournamentName: 'Torneio $id',
      dateLabel: '09/06',
      statusLabel: 'Inscrito',
      isPaid: true,
      categoryId: 'cat',
      startDate: start,
      endDate: end ?? start,
      listingStatus: listingStatus ?? TournamentListingStatus.live,
    );
  }

  MyBookingItem bookingAt(DateTime start) {
    final day =
        '${start.year}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}';
    final time =
        '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    return MyBookingItem(
      id: 'b-${start.millisecondsSinceEpoch}',
      arenaId: 'arena-1',
      arenaName: 'Arena Test',
      courtName: 'Quadra 1',
      dateRaw: day,
      startTime: time,
      endTime: '${(start.hour + 1).toString().padLeft(2, '0')}:00',
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      confirmedAthletes: const [],
      paymentDisplay: const MyBookingPaymentDisplay(label: 'Pago'),
    );
  }

  group('resolveAthleteHomeFeatured', () {
    test('active tournament today beats later booking', () {
      final featured = resolveAthleteHomeFeatured(
        registrations: [
          tournamentReg(
            id: 'today',
            start: DateTime.utc(2026, 6, 9, 3),
            end: DateTime.utc(2026, 6, 9, 3),
          ),
        ],
        bookings: [bookingAt(DateTime(2026, 6, 9, 18))],
        now: now,
      );

      expect(featured, isA<AthleteHomeFeaturedTournament>());
      expect(
        (featured! as AthleteHomeFeaturedTournament).registration.tournamentId,
        'today',
      );
    });

    test('earlier booking beats later tournament today', () {
      final featured = resolveAthleteHomeFeatured(
        registrations: [
          tournamentReg(
            id: 'tonight',
            start: DateTime(2026, 6, 9, 20),
            listingStatus: TournamentListingStatus.open,
          ),
        ],
        bookings: [bookingAt(DateTime(2026, 6, 9, 15))],
        now: now,
      );

      expect(featured, isA<AthleteHomeFeaturedBooking>());
    });

    test('booking today beats tournament tomorrow', () {
      final featured = resolveAthleteHomeFeatured(
        registrations: [
          tournamentReg(
            id: 'tomorrow',
            start: DateTime(2026, 6, 10, 8),
            listingStatus: TournamentListingStatus.open,
          ),
        ],
        bookings: [bookingAt(DateTime(2026, 6, 9, 16))],
        now: now,
      );

      expect(featured, isA<AthleteHomeFeaturedBooking>());
    });

    test('returns null when no candidates', () {
      expect(
        resolveAthleteHomeFeatured(
          registrations: const [],
          bookings: const [],
          now: now,
        ),
        isNull,
      );
    });
  });
}
