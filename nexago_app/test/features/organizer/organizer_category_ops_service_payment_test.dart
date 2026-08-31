import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_service.dart';

/// Payload das callables de pagamento. A chave `athleteUid` só pode ir junto
/// quando existe atleta: mandá-la vazia é pedir para a CF tratar como
/// confirmação da inscrição INTEIRA (ela faz `trim() || null`) — e a inscrição
/// inteira é justamente o caminho que a confirmação por atleta veio corrigir.
void main() {
  late _FakeFirebaseFunctions functions;
  late OrganizerCategoryOpsService service;

  setUp(() {
    functions = _FakeFirebaseFunctions();
    service = OrganizerCategoryOpsService(functions: functions);
  });

  group('confirmRegistrationPayment', () {
    test('sem athleteUid: só registrationId, na callable certa', () async {
      await service.confirmRegistrationPayment(registrationId: ' reg-1 ');

      expect(functions.calls, hasLength(1));
      expect(functions.calls.single.name, 'organizerConfirmRegistrationPayment');
      expect(functions.calls.single.payload, {'registrationId': 'reg-1'});
    });

    test('com athleteUid: manda o uid do atleta (aparado)', () async {
      await service.confirmRegistrationPayment(
        registrationId: 'reg-1',
        athleteUid: ' p2 ',
      );

      expect(functions.calls.single.payload, {
        'registrationId': 'reg-1',
        'athleteUid': 'p2',
      });
    });

    test('athleteUid vazio ou em branco não entra no payload', () async {
      await service.confirmRegistrationPayment(
        registrationId: 'reg-1',
        athleteUid: '',
      );
      await service.confirmRegistrationPayment(
        registrationId: 'reg-1',
        athleteUid: '   ',
      );

      for (final call in functions.calls) {
        expect(call.payload!.containsKey('athleteUid'), isFalse);
      }
    });
  });

  // A recusa útil vem escrita em português pela própria CF ("Esta inscrição já
  // tem pagamento parcial…"). Sem a tradução, a tela mostrava
  // `[firebase_functions/failed-precondition] …` cru para o organizador.
  group('erro da callable vira mensagem legível', () {
    test('confirm preserva a mensagem do servidor', () async {
      const serverMessage = 'Esta inscrição já tem pagamento parcial — '
          'confirme cada atleta individualmente.';
      functions.errors['organizerConfirmRegistrationPayment'] =
          _functionsException(
        code: 'failed-precondition',
        message: serverMessage,
      );

      await expectLater(
        () => service.confirmRegistrationPayment(registrationId: 'reg-1'),
        throwsA(
          isA<OrganizerCategoryOpsException>()
              .having((e) => e.message, 'message', serverMessage)
              .having((e) => '$e', 'toString', serverMessage),
        ),
      );
    });

    test('confirm sem mensagem cai no texto padrão', () async {
      functions.errors['organizerConfirmRegistrationPayment'] =
          _NoMessageFunctionsException();

      await expectLater(
        () => service.confirmRegistrationPayment(
          registrationId: 'reg-1',
          athleteUid: 'p1',
        ),
        throwsA(
          isA<OrganizerCategoryOpsException>().having(
            (e) => e.message,
            'message',
            'Não foi possível confirmar o pagamento.',
          ),
        ),
      );
    });

    test(
      'mensagem VAZIA do servidor também cai no texto padrão (em falha de '
      'transporte a plataforma manda "" em vez de null, e `?? fallback` '
      'sozinho deixaria o organizador com um snackbar em branco)',
      () async {
        for (final blank in <String>['', '   ']) {
          functions.errors['organizerConfirmRegistrationPayment'] =
              _functionsException(code: 'internal', message: blank);

          await expectLater(
            () => service.confirmRegistrationPayment(registrationId: 'reg-1'),
            throwsA(
              isA<OrganizerCategoryOpsException>().having(
                (e) => e.message,
                'message',
                'Não foi possível confirmar o pagamento.',
              ),
            ),
          );

          functions.errors['organizerRevertRegistrationPayment'] =
              _functionsException(code: 'internal', message: blank);

          await expectLater(
            () => service.revertRegistrationPayment(registrationId: 'reg-1'),
            throwsA(
              isA<OrganizerCategoryOpsException>().having(
                (e) => e.message,
                'message',
                'Não foi possível desfazer a confirmação.',
              ),
            ),
          );
        }
      },
    );

    test('mensagem do servidor é entregue aparada', () async {
      functions.errors['organizerConfirmRegistrationPayment'] =
          _functionsException(
        code: 'failed-precondition',
        message: '  Inscrição não encontrada  ',
      );

      await expectLater(
        () => service.confirmRegistrationPayment(registrationId: 'reg-1'),
        throwsA(
          isA<OrganizerCategoryOpsException>()
              .having((e) => e.message, 'message', 'Inscrição não encontrada'),
        ),
      );
    });

    test('revert preserva a mensagem do servidor', () async {
      const serverMessage =
          'Este atleta não tem confirmação manual do organizador para desfazer.';
      functions.errors['organizerRevertRegistrationPayment'] =
          _functionsException(
        code: 'failed-precondition',
        message: serverMessage,
      );

      await expectLater(
        () => service.revertRegistrationPayment(
          registrationId: 'reg-1',
          athleteUid: 'p1',
        ),
        throwsA(
          isA<OrganizerCategoryOpsException>()
              .having((e) => e.message, 'message', serverMessage),
        ),
      );
    });

    test('revert sem mensagem cai no texto padrão', () async {
      functions.errors['organizerRevertRegistrationPayment'] =
          _NoMessageFunctionsException();

      await expectLater(
        () => service.revertRegistrationPayment(registrationId: 'reg-1'),
        throwsA(
          isA<OrganizerCategoryOpsException>().having(
            (e) => e.message,
            'message',
            'Não foi possível desfazer a confirmação.',
          ),
        ),
      );
    });

    test('erro que não é da callable sobe intacto (não vira texto amigável '
        'que esconderia um bug de programação)', () async {
      functions.errors['organizerConfirmRegistrationPayment'] =
          StateError('bug local');

      await expectLater(
        () => service.confirmRegistrationPayment(registrationId: 'reg-1'),
        throwsA(isA<StateError>()),
      );
    });
  });

  group('revertRegistrationPayment', () {
    test('com athleteUid desfaz só a parte daquele atleta', () async {
      await service.revertRegistrationPayment(
        registrationId: 'reg-1',
        athleteUid: 'p1',
      );

      expect(functions.calls.single.name, 'organizerRevertRegistrationPayment');
      expect(functions.calls.single.payload, {
        'registrationId': 'reg-1',
        'athleteUid': 'p1',
      });
    });

    test('sem athleteUid reverte a inscrição inteira', () async {
      await service.revertRegistrationPayment(registrationId: 'reg-1');

      expect(functions.calls.single.payload, {'registrationId': 'reg-1'});
    });
  });
}

/// `FirebaseFunctionsException.message` é `String?`, mas o construtor exige
/// `String` — e o fallback do serviço existe justamente para o erro SEM
/// mensagem (rede/timeout). A subclasse é a única forma de produzir esse caso.
class _NoMessageFunctionsException extends FirebaseFunctionsException {
  _NoMessageFunctionsException() : super(code: 'internal', message: '');

  @override
  String? get message => null;
}

FirebaseFunctionsException _functionsException({
  required String code,
  required String message,
}) =>
    _TestFunctionsException(code: code, message: message);

class _TestFunctionsException extends FirebaseFunctionsException {
  _TestFunctionsException({required super.code, required super.message});
}

/// Fake mínimo de [FirebaseFunctions] — mesmo padrão de
/// `test/features/arenas/data/booking_service_coupon_test.dart`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  final calls = <({String name, Map<String, dynamic>? payload})>[];

  /// Erro a ser lançado pela callable de cada nome (simula a recusa da CF).
  final errors = <String, Object>{};

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calls.add((
          name: name,
          payload:
              parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        ));
        final error = errors[name];
        if (error != null) throw error;
      },
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall});

  final void Function(dynamic parameters) onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(null);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
