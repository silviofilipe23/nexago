import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/booking_invite_service.dart';

/// O app só chama as callables de `arena-booking-invite.ts`: nome, payload e
/// tradução de erro são o contrato com o servidor.
void main() {
  BookingInviteService serviceWith(_FakeFunctions functions) =>
      BookingInviteService(_NoFirestore(), functions: functions);

  test('convidar manda bookingId + uids e conta os convites que saíram',
      () async {
    final functions = _FakeFunctions(result: {
      'invited': [
        {'uid': 'ana', 'inviteId': 'b1_ana'},
      ],
      'skipped': [
        {'uid': 'bia', 'reason': 'pending'},
      ],
    });
    final sent = await serviceWith(functions)
        .invitePlayers(bookingId: 'b1', inviteeUids: ['ana', 'bia']);
    expect(sent, 1);
    expect(functions.calls.single.$1, 'inviteArenaBookingPlayers');
    expect(functions.calls.single.$2, {
      'bookingId': 'b1',
      'inviteeUids': ['ana', 'bia'],
    });
  });

  test('link, resposta, sair/remover e cancelar usam a callable certa',
      () async {
    final functions = _FakeFunctions(result: {
      'inviteId': 'link_b1',
      'status': 'accepted',
    });
    final service = serviceWith(functions);

    expect(await service.inviteLinkId('b1'), 'link_b1');
    expect(await service.respond('link_b1', accept: true), 'accepted');
    await service.leave('b1');
    await service.leave('b1', participantUid: 'ana');
    await service.cancelInvite('b1_bia');

    expect(functions.calls.map((c) => c.$1), [
      'getArenaBookingInviteLink',
      'respondArenaBookingInvite',
      'leaveArenaBooking',
      'leaveArenaBooking',
      'cancelArenaBookingInvite',
    ]);
    expect(functions.calls[1].$2, {'inviteId': 'link_b1', 'accept': true});
    expect(functions.calls[2].$2, {'bookingId': 'b1'});
    expect(functions.calls[3].$2, {'bookingId': 'b1', 'participantUid': 'ana'});
  });

  test('erro de regra chega em português; erro de transporte vira fallback',
      () async {
    final rule = serviceWith(_FakeFunctions(
      error: FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'A quadra já está completa.',
      ),
    ));
    await expectLater(
      rule.respond('b1_ana', accept: true),
      throwsA(
        isA<BookingInviteException>().having(
          (e) => e.message,
          'message',
          'A quadra já está completa.',
        ),
      ),
    );

    final transport = serviceWith(_FakeFunctions(
      error: FirebaseFunctionsException(code: 'not-found', message: 'NOT FOUND'),
    ));
    await expectLater(
      transport.respond('b1_ana', accept: true),
      throwsA(
        isA<BookingInviteException>().having(
          (e) => e.message,
          'message',
          'Não foi possível aceitar o convite.',
        ),
      ),
    );
  });
}

class _NoFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFunctions implements FirebaseFunctions {
  _FakeFunctions({this.result = const {}, this.error});

  final Map<String, dynamic> result;
  final FirebaseFunctionsException? error;
  final List<(String, Map<String, dynamic>)> calls = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      _FakeCallable(this, name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._functions, this._name);

  final _FakeFunctions _functions;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _functions.calls.add((_name, Map<String, dynamic>.from(parameters as Map)));
    final error = _functions.error;
    if (error != null) throw error;
    return _FakeResult<T>(_functions.result as T);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this.data);

  @override
  final T data;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
