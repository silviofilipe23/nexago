// Fakes implementam classes `@sealed` do cloud_firestore (só aviso do analyzer).
// ignore_for_file: subtype_of_sealed_class

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';

/// `cancelBooking` do atleta: reserva aguardando PIX passa pela callable
/// `cancelPendingArenaBookingPayment` (remove a cobrança aberta na Asaas antes
/// de liberar o horário); os demais status seguem com a escrita direta.
void main() {
  group('BookingService.cancelBooking', () {
    test('pending_payment cancela pela callable, sem escrita direta', () async {
      final firestore = _FakeFirestore({
        'status': 'pending_payment',
        'athleteId': 'u1',
      });
      final functions = _FakeFirebaseFunctions();
      final service = BookingService(firestore, functions: functions);

      await service.cancelBooking(bookingId: 'b1', athleteId: 'u1');

      final (name, payload) = functions.calls.single;
      expect(name, 'cancelPendingArenaBookingPayment');
      expect(payload, {'bookingId': 'b1'});
      expect(firestore.updates, isEmpty);
    });

    test('confirmed segue com a escrita direta, sem callable', () async {
      final firestore = _FakeFirestore({
        'status': 'confirmed',
        'athleteId': 'u1',
      });
      final functions = _FakeFirebaseFunctions();
      final service = BookingService(firestore, functions: functions);

      await service.cancelBooking(bookingId: 'b1', athleteId: 'u1');

      expect(functions.calls, isEmpty);
      expect(firestore.updates.single['status'], 'canceled');
      expect(firestore.updates.single['attendanceStatus'], 'canceled');
    });

    test('recusa da callable vira BookingException com a mensagem do servidor',
        () async {
      final firestore = _FakeFirestore({
        'status': 'pending_payment',
        'athleteId': 'u1',
      });
      final functions = _FakeFirebaseFunctions(
        error: FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Pagamento já registrado.',
        ),
      );
      final service = BookingService(firestore, functions: functions);

      await expectLater(
        service.cancelBooking(bookingId: 'b1', athleteId: 'u1'),
        throwsA(
          isA<BookingException>().having(
            (e) => e.message,
            'message',
            'Pagamento já registrado.',
          ),
        ),
      );
      expect(firestore.updates, isEmpty);
    });
  });
}

/// Fake mínimo de [FirebaseFirestore]: uma única reserva em `arenaBookings`,
/// registrando os `update` feitos nela.
class _FakeFirestore implements FirebaseFirestore {
  _FakeFirestore(this.booking);

  final Map<String, dynamic> booking;
  final List<Map<Object, Object?>> updates = [];

  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    expect(path, BookingService.arenaBookingsCollection);
    return _FakeCollection(this);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCollection implements CollectionReference<Map<String, dynamic>> {
  _FakeCollection(this._db);

  final _FakeFirestore _db;

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) =>
      _FakeDocRef(_db, path ?? '');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeDocRef implements DocumentReference<Map<String, dynamic>> {
  _FakeDocRef(this._db, this.id);

  final _FakeFirestore _db;

  @override
  final String id;

  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([
    GetOptions? options,
  ]) async =>
      _FakeSnapshot(id, _db.booking);

  @override
  Future<void> update(Map<Object, Object?> data) async {
    _db.updates.add(data);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeSnapshot(this.id, this._data);

  @override
  final String id;
  final Map<String, dynamic> _data;

  @override
  bool get exists => true;

  @override
  Map<String, dynamic>? data() => Map<String, dynamic>.from(_data);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Fake mínimo de [FirebaseFunctions]: registra (nome, payload) de cada
/// callable e, se [error] vier, lança no `call`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({this.error});

  final FirebaseFunctionsException? error;
  final List<(String, Map<String, dynamic>)> calls = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(this, name);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable(this._functions, this._name);

  final _FakeFirebaseFunctions _functions;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _functions.calls.add(
      (_name, Map<String, dynamic>.from(parameters as Map)),
    );
    final error = _functions.error;
    if (error != null) throw error;
    return _FakeHttpsCallableResult<T>();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  @override
  T get data => null as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
