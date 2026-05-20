import 'package:cloud_functions/cloud_functions.dart';
import 'package:url_launcher/url_launcher.dart';

/// Integração OAuth Mercado Pago do gestor (`users/{uid}/mercadopago/credentials`).
class ArenaMercadoPagoService {
  ArenaMercadoPagoService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  static const _statusCallable = 'getMercadoPagoStatus';
  static const _authUrlCallable = 'getMercadoPagoAuthUrl';

  Future<bool> isLinked() async {
    final callable = _functions.httpsCallable(_statusCallable);
    final result = await callable.call<Map<String, dynamic>>({});
    final data = result.data;
    return data['linked'] == true;
  }

  /// Abre o fluxo OAuth no navegador; ao concluir, o MP redireciona para `nexago://mercadopago`.
  Future<void> openConnectFlow() async {
    final callable = _functions.httpsCallable(_authUrlCallable);
    final result = await callable.call<Map<String, dynamic>>({
      'redirectTarget': 'app',
    });
    final url = result.data['url'] as String?;
    if (url == null || url.trim().isEmpty) {
      throw MercadoPagoLinkException('URL de autorização inválida.');
    }
    final uri = Uri.parse(url.trim());
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      throw MercadoPagoLinkException('Não foi possível abrir o Mercado Pago.');
    }
  }

  static String messageFromFunctions(FirebaseFunctionsException e) {
    final detail = e.message?.trim();
    if (detail != null && detail.isNotEmpty) return detail;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para continuar.';
      case 'permission-denied':
        return 'Sem permissão para vincular Mercado Pago.';
      case 'failed-precondition':
        return 'Mercado Pago não está configurado no servidor.';
      default:
        return 'Erro ao conectar Mercado Pago (${e.code}).';
    }
  }
}

class MercadoPagoLinkException implements Exception {
  MercadoPagoLinkException(this.message);

  final String message;

  @override
  String toString() => message;
}
