import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/firebase/fresh_connection_callable.dart';

/// A segunda tentativa de uma callable idempotente sai por um socket novo
/// (`dart:io`), fora do pool do OkHttp do SDK — ver a doc da classe.
///
/// Servidor HTTP local de verdade: o que se testa é o protocolo da callable
/// (`{"data"}` na ida, `{"result"}`/`{"error"}` na volta) e o teto de tempo.
void main() {
  late HttpServer server;
  late List<({String path, String? auth, Object? body})> requests;
  late Future<void> Function(HttpRequest request) handler;

  setUp(() async {
    requests = [];
    handler = (request) async {
      request.response
        ..statusCode = 200
        ..write(jsonEncode({
          'result': {'ok': true}
        }));
    };
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final raw = await utf8.decoder.bind(request).join();
      requests.add((
        path: request.uri.path,
        auth: request.headers.value(HttpHeaders.authorizationHeader),
        body: raw.isEmpty ? null : jsonDecode(raw),
      ));
      await handler(request);
      await request.response.close();
    });
  });

  tearDown(() => server.close(force: true));

  FreshConnectionCallable build({
    String? token = 'id-token',
    Duration timeout = const Duration(seconds: 2),
  }) {
    return FreshConnectionCallable(
      idToken: () async => token,
      endpoint: (name) => Uri.parse('http://127.0.0.1:${server.port}/$name'),
      timeout: timeout,
    );
  }

  test('envia {"data"} com o token do atleta e devolve o "result"', () async {
    final result = await build().call('setRegistrationUniform', {
      'registrationId': 'reg-1',
      'uniform': {'sizeTop': 'M', 'jerseyName': 'SILVIO'},
    });

    expect(result, {'ok': true});
    expect(requests.single.path, '/setRegistrationUniform');
    expect(requests.single.auth, 'Bearer id-token');
    expect(requests.single.body, {
      'data': {
        'registrationId': 'reg-1',
        'uniform': {'sizeTop': 'M', 'jerseyName': 'SILVIO'},
      },
    });
  });

  test('sem usuário logado não manda Authorization', () async {
    await build(token: null).call('setRegistrationUniform', const {});

    expect(requests.single.auth, isNull);
  });

  test('erro de regra de negócio volta com o código e a mensagem do servidor',
      () async {
    handler = (request) async {
      request.response
        ..statusCode = 400
        ..write(jsonEncode({
          'error': {
            'status': 'INVALID_ARGUMENT',
            'message': 'Informe o nome para a camisa.',
          },
        }));
    };

    await expectLater(
      build().call('setRegistrationUniform', const {}),
      throwsA(
        isA<FreshCallableException>()
            .having((e) => e.code, 'code', 'invalid-argument')
            .having(
                (e) => e.message, 'message', 'Informe o nome para a camisa.'),
      ),
    );
  });

  test('servidor que não responde estoura o teto como deadline-exceeded',
      () async {
    handler = (request) => Future<void>.delayed(const Duration(seconds: 2));

    final stopwatch = Stopwatch()..start();
    await expectLater(
      build(timeout: const Duration(milliseconds: 200))
          .call('setRegistrationUniform', const {}),
      throwsA(
        isA<FreshCallableException>()
            .having((e) => e.code, 'code', 'deadline-exceeded'),
      ),
    );
    expect(stopwatch.elapsed, lessThan(const Duration(seconds: 1)));
  });

  test('ninguém escutando na porta vira unavailable', () async {
    final port = server.port;
    await server.close(force: true);

    final callable = FreshConnectionCallable(
      idToken: () async => 'id-token',
      endpoint: (name) => Uri.parse('http://127.0.0.1:$port/$name'),
      timeout: const Duration(seconds: 2),
    );

    await expectLater(
      callable.call('setRegistrationUniform', const {}),
      throwsA(
        isA<FreshCallableException>()
            .having((e) => e.code, 'code', 'unavailable'),
      ),
    );
  });

  test('resposta que não é JSON de callable vira internal', () async {
    handler = (request) async {
      request.response
        ..statusCode = 200
        ..write('<html>proxy</html>');
    };

    await expectLater(
      build().call('setRegistrationUniform', const {}),
      throwsA(
        isA<FreshCallableException>().having((e) => e.code, 'code', 'internal'),
      ),
    );
  });

  test('endereço da callable é o da região de São Paulo do projeto', () {
    expect(
      callableEndpoint(
          projectId: 'volley-track-dev-4596c', name: 'setRegistrationUniform'),
      Uri.parse(
        'https://southamerica-east1-volley-track-dev-4596c.cloudfunctions.net/setRegistrationUniform',
      ),
    );
  });
}
