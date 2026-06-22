import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Resposta da callable `createArenaBookingPixPayment`.
class ArenaBookingPixPaymentResult {
  const ArenaBookingPixPaymentResult({
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.expiresAt,
    required this.amountToPayNowReais,
  });

  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final DateTime expiresAt;
  final double amountToPayNowReais;
}

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
  static const String _callableCreateArenaBookingPixPayment =
      'createArenaBookingPixPayment';
  static const String _callableCancelPendingArenaBookingPayment =
      'cancelPendingArenaBookingPayment';
  static const String _callableCreateTournamentRegistrationPixPayment =
      'createTournamentRegistrationPixPayment';
  static const String _callableConfirmFreeTournamentRegistration =
      'confirmFreeTournamentRegistration';
  static const String _callableReserveDirectOrganizerRegistration =
      'reserveDirectOrganizerRegistration';
  static const String _callableCancelPendingTournamentRegistrationPix =
      'cancelPendingTournamentRegistrationPix';

  static const Duration tournamentRegistrationPixExpiryFallback =
      Duration(minutes: 15);

  /// Prazo PIX (alinhado a `ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES` no backend).
  static const Duration arenaBookingPixExpiryFallback = Duration(minutes: 5);

  /// Gera cobrança PIX in-app (QR + copia e cola).
  Future<ArenaBookingPixPaymentResult> createArenaBookingPixPayment({
    required String bookingId,
    String? cpfCnpj,
    double? paymentFraction,
  }) async {
    if (bookingId.isEmpty) {
      throw PaymentException('Reserva inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableCreateArenaBookingPixPayment,
      );
      final payload = <String, dynamic>{'bookingId': bookingId};
      final cpf = cpfCnpj?.replaceAll(RegExp(r'\D'), '') ?? '';
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      if (paymentFraction == 0.5 || paymentFraction == 1.0) {
        payload['paymentFraction'] = paymentFraction;
      }
      final raw = await callable.call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final paymentId = map['paymentId'] as String?;
      final qrCode = map['qrCode'] as String?;
      final qrCodeBase64 = map['qrCodeBase64'] as String?;
      final expiresAtRaw = map['expiresAt'] as String?;
      final amount = (map['amountToPayNowReais'] as num?)?.toDouble();
      if (paymentId == null ||
          paymentId.isEmpty ||
          qrCode == null ||
          qrCode.isEmpty ||
          amount == null ||
          amount <= 0) {
        throw PaymentException('Resposta inválida do servidor de pagamento.');
      }
      final expiresAt = expiresAtRaw != null
          ? DateTime.tryParse(expiresAtRaw) ??
                DateTime.now().add(arenaBookingPixExpiryFallback)
          : DateTime.now().add(arenaBookingPixExpiryFallback);
      return ArenaBookingPixPaymentResult(
        paymentId: paymentId,
        qrCode: qrCode,
        qrCodeBase64: qrCodeBase64 ?? '',
        expiresAt: expiresAt,
        amountToPayNowReais: amount,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível gerar o PIX: $e');
    }
  }

  /// Gera cobrança PIX in-app para parcela de inscrição em torneio.
  Future<ArenaBookingPixPaymentResult> createTournamentRegistrationPixPayment({
    required String registrationId,
    String? cpfCnpj,
    String amountType = 'share',
  }) async {
    if (registrationId.isEmpty) {
      throw PaymentException('Inscrição inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableCreateTournamentRegistrationPixPayment,
      );
      final payload = <String, dynamic>{
        'registrationId': registrationId,
        if (amountType == 'full') 'amountType': 'full',
      };
      final cpf = cpfCnpj?.replaceAll(RegExp(r'\D'), '') ?? '';
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      final raw = await callable.call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final paymentId = map['paymentId'] as String?;
      final qrCode = map['qrCode'] as String?;
      final qrCodeBase64 = map['qrCodeBase64'] as String?;
      final expiresAtRaw = map['expiresAt'] as String?;
      final amount = (map['amountReais'] as num?)?.toDouble();
      if (paymentId == null ||
          paymentId.isEmpty ||
          qrCode == null ||
          qrCode.isEmpty ||
          amount == null ||
          amount <= 0) {
        throw PaymentException('Resposta inválida do servidor de pagamento.');
      }
      final expiresAt = expiresAtRaw != null
          ? DateTime.tryParse(expiresAtRaw) ??
                DateTime.now().add(tournamentRegistrationPixExpiryFallback)
          : DateTime.now().add(tournamentRegistrationPixExpiryFallback);
      return ArenaBookingPixPaymentResult(
        paymentId: paymentId,
        qrCode: qrCode,
        qrCodeBase64: qrCodeBase64 ?? '',
        expiresAt: expiresAt,
        amountToPayNowReais: amount,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível gerar o PIX: $e');
    }
  }

  /// Confirma inscrição gratuita (taxa zero) sem PIX.
  Future<({String registrationId, bool isPaid})>
  confirmFreeTournamentRegistration({
    required String registrationId,
  }) async {
    if (registrationId.isEmpty) {
      throw PaymentException('Inscrição inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableConfirmFreeTournamentRegistration,
      );
      final raw = await callable.call(
        <String, dynamic>{'registrationId': registrationId},
      );
      final data = raw.data;
      if (data is! Map) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final id = map['registrationId'] as String?;
      if (id == null || id.isEmpty) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      return (
        registrationId: id,
        isPaid: map['isPaid'] == true,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível confirmar a inscrição: $e');
    }
  }

  /// Reserva vaga em torneio com pagamento direto ao organizador (sem PIX).
  Future<
    ({
      String registrationId,
      bool reserved,
      bool bothAthletesReserved,
    })
  >
  reserveDirectOrganizerRegistration({
    required String registrationId,
  }) async {
    if (registrationId.isEmpty) {
      throw PaymentException('Inscrição inválida.');
    }

    try {
      final callable = _functions.httpsCallable(
        _callableReserveDirectOrganizerRegistration,
      );
      final raw = await callable.call(
        <String, dynamic>{'registrationId': registrationId},
      );
      final data = raw.data;
      if (data is! Map) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final id = map['registrationId'] as String?;
      if (id == null || id.isEmpty) {
        throw PaymentException('Resposta inválida do servidor.');
      }
      return (
        registrationId: id,
        reserved: map['reserved'] == true,
        bothAthletesReserved: map['bothAthletesReserved'] == true,
      );
    } on FirebaseFunctionsException catch (e) {
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível reservar sua vaga: $e');
    }
  }

  /// Cancela cobrança PIX pendente da parcela (não cancela a inscrição).
  Future<void> cancelPendingTournamentRegistrationPix({
    required String registrationId,
  }) async {
    if (registrationId.isEmpty) {
      throw PaymentException('Inscrição inválida.');
    }
    try {
      final callable = _functions.httpsCallable(
        _callableCancelPendingTournamentRegistrationPix,
      );
      await callable.call(<String, dynamic>{'registrationId': registrationId});
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'failed-precondition') {
        return;
      }
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível cancelar o pagamento: $e');
    }
  }

  /// Cancela reserva `pending_payment`, remove `arenaSlots` e libera locks.
  Future<void> cancelPendingArenaBookingPayment({
    required String bookingId,
  }) async {
    if (bookingId.isEmpty) {
      throw PaymentException('Reserva inválida.');
    }
    try {
      final callable = _functions.httpsCallable(
        _callableCancelPendingArenaBookingPayment,
      );
      await callable.call(<String, dynamic>{'bookingId': bookingId});
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'failed-precondition') {
        return;
      }
      throw PaymentException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw PaymentException('Não foi possível cancelar a reserva: $e');
    }
  }

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
      final callable = _functions.httpsCallable(
        _callableCreateArenaBookingMercadoPagoPayment,
      );
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
        throw PaymentException('Resposta inválida do servidor de pagamento.');
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
      throw PaymentException(
        'Não foi possível abrir o link de pagamento neste dispositivo.',
      );
    }

    final mode = kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppWebView;
    final ok = await launchUrl(
      uri,
      mode: mode,
      webOnlyWindowName: kIsWeb ? '_blank' : null,
    );
    if (!ok) {
      final fallback = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!fallback) {
        throw PaymentException('Não foi possível abrir o link de pagamento.');
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
