import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../../../core/firebase/functions_region.dart';

/// Link/QR de embaixador do NexaSquad: `?squad=CODIGO` (QR: `&via=qr`).
@immutable
class SquadRef {
  const SquadRef({required this.code, required this.origin});

  final String code;

  /// `link` ou `qr`.
  final String origin;

  @override
  bool operator ==(Object other) =>
      other is SquadRef && other.code == code && other.origin == origin;

  @override
  int get hashCode => Object.hash(code, origin);
}

final RegExp _squadCodeRe = RegExp(r'^[A-Z0-9]{3,20}$');

/// Lê o `?squad=` de um deep link. Código fora do formato é ignorado (o
/// servidor recusaria do mesmo jeito).
SquadRef? squadRefFromUri(Uri uri) {
  final code = (uri.queryParameters['squad'] ?? '').trim().toUpperCase();
  if (!_squadCodeRe.hasMatch(code)) return null;
  return SquadRef(
    code: code,
    origin: uri.queryParameters['via'] == 'qr' ? 'qr' : 'link',
  );
}

/// Grava o clique na conta pela callable `recordSquadAttribution`. Janela,
/// modelo de toque e autoindicação são do servidor.
class SquadAttributionService {
  SquadAttributionService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<void> record(SquadRef ref) async {
    await _functions.httpsCallable('recordSquadAttribution').call<dynamic>(
      <String, dynamic>{'code': ref.code, 'origin': ref.origin},
    );
  }

  /// Melhor esforço: atribuição que falha nunca atrapalha a navegação.
  Future<void> recordQuietly(SquadRef ref) async {
    try {
      await record(ref);
    } catch (e) {
      debugPrint('recordSquadAttribution falhou: $e');
    }
  }
}
