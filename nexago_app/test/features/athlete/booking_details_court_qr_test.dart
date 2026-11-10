import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/location/user_location_providers.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/booking_court_qr.dart';
import 'package:nexago_app/features/arenas/domain/booking_providers.dart';
import 'package:nexago_app/features/athlete/domain/booking_attendance_providers.dart';
import 'package:nexago_app/features/athlete/presentation/booking_details_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_court_qr_card.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/booking_details/booking_details_team_providers.dart';
import 'package:nexago_app/features/athlete_training/presentation/widgets/court_qr_scanner.dart';

/// Check-in pelo QR da quadra na reserva (`docs/product/reservas-por-capacidade.md`, PR 4c;
/// canvas "Reservas por capacidade · app do atleta" 05–08).
const courtQr = 'nexago-checkin:v1:abcdefghijklmnopqrstuv';

Map<String, dynamic> bookingData(DateTime startAt, [Map<String, dynamic> extra = const {}]) {
  String two(int n) => n.toString().padLeft(2, '0');
  final end = startAt.add(const Duration(hours: 1));
  return {
    'athleteId': 'atleta-1',
    'arenaId': 'a1',
    'arenaName': 'Arena CFC',
    'courtId': 'c7',
    'courtName': 'Quadra 7',
    'date': '${startAt.year}-${two(startAt.month)}-${two(startAt.day)}',
    'startTime': '${two(startAt.hour)}:${two(startAt.minute)}',
    'endTime': '${two(end.hour)}:${two(end.minute)}',
    'status': 'active',
    'allocationStatus': 'unassigned',
    'allocationSource': 'auto',
    ...extra,
  };
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('bookingCourtQrState', () {
    final start = DateTime(2026, 11, 20, 19);
    final end = DateTime(2026, 11, 20, 20);
    BookingCourtQrStage stage(Map<String, dynamic>? data, DateTime now) =>
        bookingCourtQrState(data, startAt: start, endAt: end, now: now).stage;

    test('reserva comum (sem alocação) não tem card', () {
      final data = bookingData(start)..remove('allocationStatus');
      expect(stage(data, DateTime(2026, 11, 20, 19)), BookingCourtQrStage.hidden);
      expect(stage(null, DateTime(2026, 11, 20, 19)), BookingCourtQrStage.hidden);
    });

    test('janela: 20 min antes até o fim', () {
      final data = bookingData(start);
      expect(stage(data, DateTime(2026, 11, 20, 18, 39)), BookingCourtQrStage.early);
      expect(stage(data, DateTime(2026, 11, 20, 18, 40)), BookingCourtQrStage.open);
      expect(stage(data, DateTime(2026, 11, 20, 19, 59)), BookingCourtQrStage.open);
      expect(stage(data, DateTime(2026, 11, 20, 20)), BookingCourtQrStage.hidden);
    });

    test('quadra definida pela recepção ainda lê o QR; check-in feito mostra a quadra', () {
      final assigned = bookingData(start, {'allocationStatus': 'assigned', 'allocationSource': 'staff'});
      expect(stage(assigned, DateTime(2026, 11, 20, 19)), BookingCourtQrStage.open);
      final done = bookingCourtQrState(
        bookingData(start, {'attendanceStatus': 'checked_in', 'allocationStatus': 'assigned'}),
        startAt: start,
        endAt: end,
        now: DateTime(2026, 11, 20, 21),
      );
      expect(done.stage, BookingCourtQrStage.done);
      expect(done.courtName, 'Quadra 7');
    });

    test('cancelada, falta e aula não têm card', () {
      final now = DateTime(2026, 11, 20, 19);
      expect(stage(bookingData(start, {'status': 'cancelled'}), now), BookingCourtQrStage.hidden);
      expect(stage(bookingData(start, {'attendanceStatus': 'no_show'}), now), BookingCourtQrStage.hidden);
      expect(stage(bookingData(start, {'isClassSession': true}), now), BookingCourtQrStage.hidden);
    });
  });

  group('tela da reserva', () {
    late StreamController<DocumentSnapshot<Map<String, dynamic>>?> docs;
    late List<String> scans;
    late List<String> calls;

    Future<void> pump(
      WidgetTester tester, {
      required Map<String, dynamic> data,
      required DateTime startAt,
      List<String?> scanResults = const [courtQr],
      Future<String> Function(String bookingId, String qr)? checkIn,
    }) async {
      tester.view.physicalSize = const Size(1080, 6000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      docs = StreamController.broadcast();
      addTearDown(docs.close);
      scans = [];
      calls = [];
      final pending = [...scanResults];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'atleta-1'))),
            arenaBookingDocProvider.overrideWith((ref, id) async* {
              yield _FakeDoc(data);
              yield* docs.stream;
            }),
            bookingAttendanceProvider.overrideWith((ref, id) => Stream.value(null)),
            bookingDetailsTeamProvider.overrideWith(
              (ref, id) async => const BookingDetailsTeamState(members: [], confirmedCount: 1, totalSlots: 4),
            ),
            userLocationProvider.overrideWith(
              (ref) async => const UserLocationSnapshot(source: UserLocationSource.none),
            ),
            courtQrScanLauncherProvider.overrideWithValue((context) async {
              scans.add('scan');
              return pending.isEmpty ? null : pending.removeAt(0);
            }),
            bookingQrCheckInProvider.overrideWithValue((bookingId, qr) async {
              calls.add('$bookingId/$qr');
              return checkIn == null ? 'Quadra 7' : checkIn(bookingId, qr);
            }),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: BookingDetailsPage(
              bookingId: 'reserva-1',
              arenaId: null,
              arenaName: 'Arena CFC',
              courtName: 'Quadra definida na chegada',
              startAt: startAt,
              endAt: startAt.add(const Duration(hours: 1)),
              status: 'active',
              confirmedParticipants: 1,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('chegou: lê o QR, o servidor define a quadra e a tela mostra o check-in', (tester) async {
      final startAt = DateTime.now().add(const Duration(minutes: 10));
      final data = bookingData(startAt);
      await pump(tester, data: data, startAt: startAt, checkIn: (id, qr) async {
        docs.add(_FakeDoc({
          ...data,
          'courtName': 'Quadra 3',
          'allocationStatus': 'assigned',
          'allocationSource': 'qr',
          'attendanceStatus': 'checked_in',
        }));
        return 'Quadra 3';
      });

      expect(find.text('Chegou? Leia o QR da quadra'), findsOneWidget);
      expect(find.text('Fazer check-in'), findsNothing);
      expect(find.text('Quadra 7'), findsNothing);

      await tester.tap(find.byKey(const Key('booking-qr-scan')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(calls, ['reserva-1/$courtQr']);
      expect(find.text('Check-in feito'), findsOneWidget);
      expect(find.byKey(const Key('booking-qr-court')), findsOneWidget);
      expect(find.text('Check-in feito · Quadra 3'), findsOneWidget);
    });

    testWidgets('quadra ocupada: folha explica e deixa ler outro QR', (tester) async {
      final startAt = DateTime.now().add(const Duration(minutes: 10));
      await pump(
        tester,
        data: bookingData(startAt),
        startAt: startAt,
        scanResults: [courtQr, null],
        checkIn: (id, qr) async => throw BookingException(
          'Essa quadra está ocupada nesse horário. Confira com a recepção qual é a sua quadra.',
          code: 'court_taken',
        ),
      );

      await tester.tap(find.byKey(const Key('booking-qr-scan')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Essa quadra está ocupada nesse horário'), findsOneWidget);

      await tester.tap(find.byKey(const Key('booking-qr-retry')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(scans.length, 2);
    });

    testWidgets('QR que não é do nexaGO não chama o servidor', (tester) async {
      final startAt = DateTime.now().add(const Duration(minutes: 10));
      await pump(tester, data: bookingData(startAt), startAt: startAt, scanResults: ['https://cardapio.example']);

      await tester.tap(find.byKey(const Key('booking-qr-scan')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Este QR não é da quadra'), findsOneWidget);
      expect(calls, isEmpty);
    });

    testWidgets('cedo: explica a chegada sem botão', (tester) async {
      final startAt = DateTime.now().add(const Duration(hours: 3));
      await pump(tester, data: bookingData(startAt), startAt: startAt);
      expect(find.text('Chegou? Leia o QR da quadra'), findsOneWidget);
      expect(find.byKey(const Key('booking-qr-scan')), findsNothing);
      expect(find.textContaining('abre às'), findsOneWidget);
    });

    testWidgets('reserva de arena comum segue sem o card', (tester) async {
      final startAt = DateTime.now().add(const Duration(minutes: 10));
      final data = bookingData(startAt)
        ..remove('allocationStatus')
        ..remove('allocationSource');
      await pump(tester, data: data, startAt: startAt);
      expect(find.text('Chegou? Leia o QR da quadra'), findsNothing);
    });
  });
}

// ignore: subtype_of_sealed_class
class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc(this._fields);

  final Map<String, dynamic> _fields;

  @override
  String get id => 'reserva-1';

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference => throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
