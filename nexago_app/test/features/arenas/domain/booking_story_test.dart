import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_success_args.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';

BookingStoryPerson pessoa(String nome) =>
    BookingStoryPerson(firstName: nome, initials: nome.substring(0, 2));

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('bookingStoryDataFrom', () {
    test('formata hora, data e esporte como na arte do protótipo', () {
      final data = bookingStoryDataFrom(
        arenaName: ' Arena CFC ',
        courtName: 'Quadra 1',
        dateKey: '2026-05-22',
        startTime: '09:00:00',
        endTime: '10:30',
        sport: 'beachVolleyball',
      );

      expect(data.timeRange, '09:00–10:30');
      expect(data.dateLabel, 'SEX · 22 MAI');
      expect(data.arenaName, 'Arena CFC');
      expect(data.sportLabel, 'VÔLEI DE PRAIA');
    });

    test('rótulo legado da quadra também resolve o esporte', () {
      final data = bookingStoryDataFrom(
        arenaName: 'Arena',
        courtName: 'Q1',
        dateKey: '2026-05-22',
        startTime: '18:00',
        endTime: '19:00',
        sport: 'Beach tennis',
      );

      expect(data.sportLabel, 'BEACH TENNIS');
    });

    test('sem esporte nem galera: chips de Modalidade e Galera somem', () {
      final data = bookingStoryDataFrom(
        arenaName: 'Arena',
        courtName: 'Q1',
        dateKey: '2026-05-22',
        startTime: '18:00',
        endTime: '19:00',
      );

      expect(data.sportLabel, isNull);
      expect(data.availableInfos, [
        BookingStoryInfo.time,
        BookingStoryInfo.arena,
      ]);
    });

    test('com esporte e galera: os quatro chips, na ordem do protótipo', () {
      final data = bookingStoryDataFrom(
        arenaName: 'Arena',
        courtName: 'Q1',
        dateKey: '2026-05-22',
        startTime: '18:00',
        endTime: '19:00',
        sport: 'padel',
        crew: [pessoa('Ana')],
      );

      expect(data.availableInfos, BookingStoryInfo.values);
    });
  });

  group('bookingStoryTimeRange', () {
    test('um lado vazio devolve só o outro', () {
      expect(bookingStoryTimeRange('18:00', ''), '18:00');
      expect(bookingStoryTimeRange('', '19:00'), '19:00');
    });
  });

  group('bookingStoryCrew', () {
    test('quem reservou vem primeiro, só com o primeiro nome', () {
      final crew = bookingStoryCrew(
        ownerUid: 'u1',
        ownerName: 'Maria Alves',
        ownerAvatarUrl: 'https://x/m.jpg',
        confirmed: const [
          MyBookingConfirmedAthlete(userId: 'u2', displayName: 'Enzo Lima'),
        ],
      );

      expect([for (final p in crew) p.firstName], ['Maria', 'Enzo']);
      expect(crew.first.initials, 'MA');
      expect(crew.first.avatarUrl, 'https://x/m.jpg');
    });

    test('o dono listado entre os confirmados não aparece duas vezes', () {
      final crew = bookingStoryCrew(
        ownerUid: 'u1',
        ownerName: 'Maria',
        confirmed: const [
          MyBookingConfirmedAthlete(userId: 'u1', displayName: 'Maria'),
          MyBookingConfirmedAthlete(displayName: 'Lia'),
          MyBookingConfirmedAthlete(displayName: 'Lia'),
        ],
      );

      expect([for (final p in crew) p.firstName], ['Maria', 'Lia']);
    });

    test('sem nome não entra; avatar vazio vira null', () {
      final crew = bookingStoryCrew(
        ownerUid: 'u1',
        ownerName: '  ',
        confirmed: const [
          MyBookingConfirmedAthlete(userId: 'u2', avatarUrl: 'https://x'),
          MyBookingConfirmedAthlete(
            userId: 'u3',
            displayName: 'Rafael',
            avatarUrl: ' ',
          ),
        ],
      );

      expect(crew, hasLength(1));
      expect(crew.single.firstName, 'Rafael');
      expect(crew.single.avatarUrl, isNull);
    });
  });

  group('bookingStoryCrewNames', () {
    test('junta com vírgula e "e"; de 5 em diante resume em +N', () {
      expect(bookingStoryCrewNames([]), '');
      expect(bookingStoryCrewNames([pessoa('Ana')]), 'Ana');
      expect(
          bookingStoryCrewNames([pessoa('Ana'), pessoa('Enzo')]), 'Ana e Enzo');
      expect(
        bookingStoryCrewNames([pessoa('Ana'), pessoa('Enzo'), pessoa('Lia')]),
        'Ana, Enzo e Lia',
      );
      expect(
        bookingStoryCrewNames([
          pessoa('Ana'),
          pessoa('Enzo'),
          pessoa('Rafael'),
          pessoa('Lia'),
        ]),
        'Ana, Enzo, Rafael e Lia',
      );
      expect(
        bookingStoryCrewNames([
          pessoa('Ana'),
          pessoa('Enzo'),
          pessoa('Rafael'),
          pessoa('Lia'),
          pessoa('Bia'),
        ]),
        'Ana, Enzo, Rafael e +2',
      );
    });
  });

  test('bookingStoryCrewCaption: sozinho convida, com galera conta', () {
    expect(bookingStoryCrewCaption(1), 'Quem vem jogar?');
    expect(bookingStoryCrewCaption(4), '4 na quadra');
  });

  test('bookingStoryShareText: legenda com arena, dia, hora e a hashtag', () {
    final data = bookingStoryDataFrom(
      arenaName: 'Arena CFC',
      courtName: 'Quadra 1',
      dateKey: '2026-05-22',
      startTime: '09:00',
      endTime: '10:30',
    );

    expect(
      bookingStoryShareText(data),
      'Quadra garantida na Arena CFC! sex · 22 mai · 09:00–10:30. '
      'Bora jogar? #vamosnexa',
    );
  });

  group('isBookingStoryShareable', () {
    test('reserva garantida (inclusive pagar na arena) oferece o story', () {
      for (final status in [
        'confirmed',
        'CONFIRMED',
        'booked',
        'active',
        'pay_at_arena',
        'checkin_open',
      ]) {
        expect(isBookingStoryShareable(status), isTrue, reason: status);
      }
    });

    test('cancelada ou esperando pagamento não oferece', () {
      for (final status in [
        'canceled',
        'cancelled',
        'pending',
        'processing',
        'PENDING_PAYMENT',
      ]) {
        expect(isBookingStoryShareable(status), isFalse, reason: status);
      }
    });
  });

  group('BookingStoryArgs', () {
    test('da confirmação: id da primeira reserva do lote', () {
      final args = BookingStoryArgs.fromSuccess(
        const BookingSuccessArgs(
          arenaId: 'a1',
          arenaName: 'Arena Sol',
          courtName: 'Quadra 2',
          dateKey: '2026-10-23',
          startTime: '19:00',
          endTime: '20:00',
          dateLabel: '23 out 2026',
          timeRangeLabel: '19:00 – 20:00',
          bookingIds: [' b9 ', 'b10'],
        ),
      );

      expect(args.bookingId, 'b9');
      expect(args.arenaName, 'Arena Sol');
      expect(args.dateKey, '2026-10-23');
    });

    test('da lista de reservas (home): quadra ausente vira vazio', () {
      final args = BookingStoryArgs.fromBooking(
        const MyBookingItem(
          id: 'b7',
          arenaName: 'Arena Sol',
          dateRaw: '2026-10-23',
          startTime: '19:00',
          endTime: '20:00',
          rawStatus: 'confirmed',
          paymentDisplay: MyBookingPaymentDisplay(label: 'PIX'),
        ),
      );

      expect(args.bookingId, 'b7');
      expect(args.courtName, '');
      expect(args.startTime, '19:00');
    });
  });
}
