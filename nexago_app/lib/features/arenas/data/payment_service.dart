import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Resposta da callable [createArenaBookingMercadoPagoPayment].
class ArenaBookingPaymentResult {
  const ArenaBookingPaymentResult({
    required this.initPoint,
    required this.preferenceId,
  });

  /// URL do checkout Mercado Pago (`init_point`).
  final String initPoint;

  final String preferenceId;
}

/// Chama a Cloud Function e abre o checkout (navegador in-app ou externo).
class PaymentService {
  PaymentService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  static const String _callableCreateArenaBookingMercadoPagoPayment =
      'createArenaBookingMercadoPagoPayment';

  /// Cria preferência MP e persiste `paymentId` / `paymentStatus: pending` na reserva.
  Future<ArenaBookingPaymentResult> createArenaBookingMercadoPagoPayment({
    required String bookingId,
    required String userId,
    required double valor,
  }) async {
    if (bookingId.isEmpty) {
      throw PaymentException('Reserva inválida.');
    }
    if (userId.isEmpty) {
      throw PaymentException('Faça login para pagar.');
    }
    if (valor <= 0 || !valor.isFinite) {
      throw PaymentException('Valor inválido.');
    }

    try {
      final callable = _functions.httpsCallable(_callableCreateArenaBookingMercadoPagoPayment);
      final raw = await callable.call(<String, dynamic>{
        'bookingId': bookingId,
        'userId': userId,
        'valor': valor,
      });

      final data = raw.data;
      if (data is! Map) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final initPoint = map['init_point'] as String?;
      final preferenceId = map['preferenceId'] as String?;
      if (initPoint == null ||
          initPoint.isEmpty ||
          preferenceId == null ||
          preferenceId.isEmpty) {
        throw PaymentException('Resposta inválida do Mercado Pago.');
      }
      return ArenaBookingPaymentResult(
        initPoint: initPoint,
        preferenceId: preferenceId,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível iniciar o pagamento: $e');
    }
  }

  /// Abre o checkout. Em mobile usa visualização in-app (Custom Tabs / SFSafariViewController) quando suportado.
  Future<void> openMercadoPagoCheckout(String initPoint) async {
    final uri = Uri.tryParse(initPoint);
    if (uri == null || !uri.hasScheme) {
      throw PaymentException('Link de pagamento inválido.');
    }
    final can = await canLaunchUrl(uri);
    if (!can) {
      throw PaymentException('Não foi possível abrir o link de pagamento neste dispositivo.');
    }

    final mode = kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppWebView;
    final ok = await launchUrl(
      uri,
      mode: mode,
      webOnlyWindowName: kIsWeb ? '_blank' : null,
    );
    if (!ok) {
      final fallback = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!fallback) {
        throw PaymentException('Não foi possível abrir o Mercado Pago.');
      }
    }
  }

  static String _mapFunctionsMessage(FirebaseFunctionsException e) {
    final code = e.code;
    final detail = e.message;
    switch (code) {
      case 'unauthenticated':
        return 'Faça login para pagar.';
      case 'permission-denied':
        return detail ?? 'Sem permissão para este pagamento.';
      case 'not-found':
        return 'Reserva ou arena não encontrada.';
      case 'invalid-argument':
        return detail ?? 'Dados inválidos.';
      case 'failed-precondition':
        return detail ?? 'Pagamento indisponível para esta reserva.';
      case 'internal':
        return detail ?? 'Erro no servidor. Tente novamente.';
      default:
        return detail ?? 'Erro ao gerar pagamento ($code).';
    }
  }
}

class PaymentException implements Exception {
  PaymentException(this.message);

  final String message;

  @override
  String toString() => message;
}
