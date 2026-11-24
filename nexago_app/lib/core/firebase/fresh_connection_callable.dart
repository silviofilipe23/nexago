import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import 'functions_region.dart';

/// Teto da tentativa por conexão nova: conectar + a callable responder. A
/// callable leve leva ~0,1 s, ~7 s no pior cold start medido.
const Duration kFreshCallableTimeout = Duration(seconds: 15);

/// Falha da callable chamada por [FreshConnectionCallable]. [code] segue o
/// formato do plugin (`invalid-argument`, `deadline-exceeded`…), então o
/// chamador trata igual a um `FirebaseFunctionsException`.
class FreshCallableException implements Exception {
  const FreshCallableException({required this.code, required this.message});

  final String code;
  final String message;

  @override
  String toString() => 'FreshCallableException($code): $message';
}

/// Endereço público da callable em São Paulo — o mesmo que o SDK monta.
Uri callableEndpoint({
  required String projectId,
  required String name,
  String region = kFunctionsRegion,
}) =>
    Uri.https('$region-$projectId.cloudfunctions.net', '/$name');

/// Chama uma callable por um socket NOVO, fora do SDK do Functions.
///
/// **Por que existe.** No Android o SDK usa um OkHttp com pool de conexões
/// HTTP/2 para todas as callables. Quando a rede derruba essa conexão em
/// silêncio (NAT da operadora, troca Wi-Fi/4G, app voltando do segundo
/// plano), o OkHttp não percebe: a chamada seguinte entra no socket morto, a
/// requisição nunca chega ao servidor e, passado o teto, o plugin devolve
/// `deadline-exceeded` com a mensagem literal "DEADLINE_EXCEEDED". Foi o caso
/// do nome na camisa (24/11): nenhuma requisição do aparelho chegou a função
/// nenhuma depois do último sucesso.
///
/// **Por que não basta repetir pelo SDK.** O OkHttp 4.10 só aposenta a conexão
/// quando a falha é do servidor/rede; stream cancelado pelo PRÓPRIO timeout
/// conta como cancelamento local e a conexão continua no pool como saudável.
/// A segunda tentativa cairia no mesmo socket.
///
/// **Só para callable idempotente** (gravar o mesmo valor duas vezes dá no
/// mesmo): a primeira tentativa pode ter chegado ao servidor sem a resposta
/// voltar.
class FreshConnectionCallable {
  FreshConnectionCallable({
    required Future<String?> Function() idToken,
    required Uri Function(String name) endpoint,
    Duration timeout = kFreshCallableTimeout,
  })  : _idToken = idToken,
        _endpoint = endpoint,
        _timeout = timeout;

  /// Usuário logado e projeto do app — o que o SDK usaria.
  factory FreshConnectionCallable.forCurrentApp() => FreshConnectionCallable(
        idToken: () async => FirebaseAuth.instance.currentUser?.getIdToken(),
        endpoint: (name) => callableEndpoint(
          projectId: Firebase.app().options.projectId,
          name: name,
        ),
      );

  final Future<String?> Function() _idToken;
  final Uri Function(String name) _endpoint;
  final Duration _timeout;

  /// Devolve o `result` da callable; falha vira [FreshCallableException].
  Future<Object?> call(String name, Map<String, dynamic> data) async {
    // Um cliente por chamada, fechado no fim: nada de pool para envelhecer.
    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      return await _post(client, name, data).timeout(_timeout);
    } on TimeoutException {
      throw const FreshCallableException(
        code: 'deadline-exceeded',
        message: 'deadline-exceeded',
      );
    } on SocketException {
      throw const FreshCallableException(
        code: 'unavailable',
        message: 'unavailable',
      );
    } on HttpException {
      throw const FreshCallableException(
        code: 'unavailable',
        message: 'unavailable',
      );
    } finally {
      client.close(force: true);
    }
  }

  Future<Object?> _post(
    HttpClient client,
    String name,
    Map<String, dynamic> data,
  ) async {
    final token = await _idToken();
    final request = await client.postUrl(_endpoint(name));
    request.headers.contentType = ContentType.json;
    if (token != null && token.isNotEmpty) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    }
    request.write(jsonEncode({'data': data}));
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    return decodeCallableResponse(response.statusCode, body);
  }
}

/// Protocolo da callable: sucesso é `{"result": …}`; falha é
/// `{"error": {"status": "INVALID_ARGUMENT", "message": …}}`.
Object? decodeCallableResponse(int statusCode, String body) {
  final Object? decoded;
  try {
    decoded = jsonDecode(body);
  } on FormatException {
    throw const FreshCallableException(
      code: 'internal',
      message: 'internal',
    );
  }
  if (decoded is! Map) {
    throw const FreshCallableException(code: 'internal', message: 'internal');
  }

  final error = decoded['error'];
  if (error is Map) {
    final status = (error['status'] as String?)?.trim() ?? '';
    final code =
        status.isEmpty ? 'internal' : status.toLowerCase().replaceAll('_', '-');
    final message = (error['message'] as String?)?.trim() ?? '';
    throw FreshCallableException(
      code: code,
      message: message.isEmpty ? code : message,
    );
  }

  if (statusCode != HttpStatus.ok || !decoded.containsKey('result')) {
    throw const FreshCallableException(code: 'internal', message: 'internal');
  }
  return decoded['result'];
}
