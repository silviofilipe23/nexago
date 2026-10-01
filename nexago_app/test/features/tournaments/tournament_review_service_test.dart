import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_review_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

void main() {
  group('TournamentReviewService.submit', () {
    test('manda nota, aspectos pelas chaves do backend e comentário recortado', () async {
      final functions = _FakeFunctions();
      final service = TournamentReviewService(functions: functions);

      final created = await service.submit(
        tournamentId: 't1',
        overall: 4,
        aspects: {
          TournamentReviewAspect.schedule: 2,
          TournamentReviewAspect.venue: 5,
        },
        comment: '  Atrasou  ',
      );

      expect(created, isTrue);
      expect(functions.calls.single.name, 'submitTournamentReview');
      expect(functions.calls.single.payload, {
        'tournamentId': 't1',
        'overall': 4,
        'aspects': {'schedule': 2, 'venue': 5},
        'comment': 'Atrasou',
      });
    });

    test('comentário só com espaços vai como null e sem aspectos vai mapa vazio', () async {
      final functions = _FakeFunctions();
      await TournamentReviewService(functions: functions).submit(
        tournamentId: 't1',
        overall: 5,
        aspects: const {},
        comment: ' \n ',
      );
      expect(functions.calls.single.payload!['comment'], isNull);
      expect(functions.calls.single.payload!['aspects'], <String, int>{});
    });

    test('edição: created=false devolve false', () async {
      final functions = _FakeFunctions()..result = const {'ok': true, 'created': false};
      final created = await TournamentReviewService(functions: functions)
          .submit(tournamentId: 't1', overall: 3, aspects: const {});
      expect(created, isFalse);
    });

    test('a mensagem do servidor chega ao atleta', () async {
      final functions = _FakeFunctions()
        ..error = _TestFunctionsException(
          code: 'failed-precondition',
          message: 'A avaliação deste torneio foi encerrada.',
        );
      await expectLater(
        TournamentReviewService(functions: functions)
            .submit(tournamentId: 't1', overall: 3, aspects: const {}),
        throwsA(isA<TournamentReviewException>().having(
            (e) => e.message, 'message', 'A avaliação deste torneio foi encerrada.')),
      );
    });

    test('callable não deployada ("NOT FOUND") vira mensagem legível', () async {
      final functions = _FakeFunctions()
        ..error = _TestFunctionsException(code: 'not-found', message: 'NOT FOUND');
      await expectLater(
        TournamentReviewService(functions: functions)
            .submit(tournamentId: 't1', overall: 3, aspects: const {}),
        throwsA(isA<TournamentReviewException>().having(
          (e) => e.message,
          'message',
          'Não foi possível enviar sua avaliação. Tente de novo em instantes.',
        )),
      );
    });
  });
}

class _TestFunctionsException extends FirebaseFunctionsException {
  _TestFunctionsException({required super.code, required super.message});
}

/// Fake mínimo de [FirebaseFunctions] — padrão de
/// `test/features/organizer/organizer_category_ops_service_payment_test.dart`, com retorno
/// configurável (`created` decide o XP).
class _FakeFunctions implements FirebaseFunctions {
  final calls = <({String name, Map<String, dynamic>? payload})>[];
  Object? result = const {'ok': true, 'created': true};
  Object? error;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeCallable((parameters) {
      calls.add((
        name: name,
        payload: parameters is Map ? Map<String, dynamic>.from(parameters) : null,
      ));
      final failure = error;
      if (failure != null) throw failure;
      return result;
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this.onCall);

  final Object? Function(dynamic parameters) onCall;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async =>
      _FakeResult<T>(onCall(parameters));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
