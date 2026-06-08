import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_labels.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_success_actions.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });
  group('formatBookingDisplayCode', () {
    test('uses last five characters uppercase', () {
      expect(
        ArenaBookingSuccessActions.formatBookingDisplayCode('abc123404299'),
        '#NXG-04299',
      );
    });
  });

  group('formatTicketDateCompact', () {
    test('formats weekday day month in uppercase', () {
      final label = formatTicketDateCompact('2026-05-22');
      expect(label, contains('•'));
      expect(label, contains('22'));
      expect(label.length, greaterThan(8));
    });
  });

  group('buildBookingShareMessage', () {
    test('includes arena date and code', () {
      final msg = ArenaBookingSuccessActions.buildBookingShareMessage(
        arenaName: 'Arena CFC',
        courtName: 'Quadra 1',
        dateLabel: '22 mai 2026',
        timeRangeLabel: '09:00 – 10:30',
        bookingId: 'booking-04299',
        displayCode: '#NXG-04299',
      );
      expect(msg, contains('Arena CFC'));
      expect(msg, contains('#NXG-04299'));
      expect(msg, contains('09:00'));
    });
  });

  group('buildGoogleCalendarEventUrl', () {
    test('returns calendar template url', () {
      final url = ArenaBookingSuccessActions.buildGoogleCalendarEventUrl(
        title: 'Reserva',
        dateKey: '2026-05-22',
        startTime: '09:00',
        endTime: '10:30',
      );
      expect(url, isNotNull);
      expect(url!, contains('calendar.google.com'));
      expect(url, contains('action=TEMPLATE'));
      expect(url, contains('dates='));
    });
  });

  group('buildMapsDirectionsUrl', () {
    test('includes destination and origin coordinates', () {
      final url = ArenaBookingSuccessActions.buildMapsDirectionsUrl(
        destination: '-16.6869,-49.2648',
        origin: '-16.6799,-49.2550',
      );
      expect(url, contains('google.com/maps/dir'));
      expect(url, contains('destination=-16.6869%2C-49.2648'));
      expect(url, contains('origin=-16.6799%2C-49.2550'));
      expect(url, contains('travelmode=driving'));
    });

    test('omits origin when not provided', () {
      final url = ArenaBookingSuccessActions.buildMapsDirectionsUrl(
        destination: 'Arena CFC, Goiânia',
      );
      expect(url, contains('destination='));
      expect(url, isNot(contains('origin=')));
    });
  });

  group('resolveMapsDestination', () {
    test('prefers arena coordinates over text', () {
      final dest = ArenaBookingSuccessActions.resolveMapsDestination(
        arenaName: 'Arena CFC',
        locationLabel: 'Goiânia · GO',
        latitude: -16.6869,
        longitude: -49.2648,
      );
      expect(dest, '-16.6869,-49.2648');
    });

    test('falls back to location label', () {
      final dest = ArenaBookingSuccessActions.resolveMapsDestination(
        arenaName: 'Arena CFC',
        locationLabel: 'Goiânia · GO',
      );
      expect(dest, 'Goiânia · GO');
    });
  });

  group('buildWhatsAppUrl', () {
    test('normalizes brazilian mobile', () {
      final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
        phone: '(11) 98765-4321',
        message: 'Oi',
      );
      expect(url, contains('wa.me/5511987654321'));
    });

    test('returns null for empty phone', () {
      expect(
        ArenaBookingSuccessActions.buildWhatsAppUrl(phone: null, message: 'x'),
        isNull,
      );
    });
  });
}
