import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/validation/cpf_cnpj.dart';
import '../domain/arena_plan.dart';

/// Método de cobrança enviado ao backend (`billingType` do Asaas).
enum ArenaSubscriptionMethod { pix, creditCard }

extension ArenaSubscriptionMethodX on ArenaSubscriptionMethod {
  String get billingType =>
      this == ArenaSubscriptionMethod.creditCard ? 'CREDIT_CARD' : 'PIX';
}

/// Resposta da callable `createArenaSubscription`.
class ArenaSubscriptionResult {
  const ArenaSubscriptionResult({
    required this.subscriptionId,
    required this.paymentId,
    required this.billingType,
    required this.tier,
    required this.cycle,
    this.invoiceUrl,
    this.qrCode,
    this.qrCodeBase64,
  });

  final String subscriptionId;
  final String paymentId;
  final String billingType;
  final ArenaPlanTier tier;
  final ArenaBillingCycle cycle;

  /// Checkout hospedado Asaas (cartão). Nulo para PIX.
  final String? invoiceUrl;

  /// PIX copia-e-cola. Nulo para cartão.
  final String? qrCode;
  final String? qrCodeBase64;

  bool get isPix => billingType == 'PIX' && (qrCode?.isNotEmpty ?? false);
}

class ArenaSubscriptionException implements Exception {
  ArenaSubscriptionException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ArenaSubscriptionRepository {
  ArenaSubscriptionRepository(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  /// CNPJ/CPF já salvo no doc da arena (para pré-preencher o formulário).
  Future<String> fetchStoredCpfCnpj(String arenaId) async {
    final id = arenaId.trim();
    if (id.isEmpty) return '';
    final snap = await _firestore.collection('arenas').doc(id).get();
    final d = snap.data();
    final raw = (d?['cpfCnpj'] ?? d?['cnpj'] ?? d?['document']) as String?;
    return CpfCnpjValidator.normalize(raw ?? '');
  }

  /// Estado do plano em tempo real (campos públicos de `arenas/{id}`).
  Stream<ArenaPlanStatus> watchPlan(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(ArenaPlanStatus.none);
    return _firestore
        .collection('arenas')
        .doc(id)
        .snapshots()
        .map((snap) => ArenaPlanStatus.fromArenaDoc(snap.data()));
  }

  /// Cria a assinatura recorrente. PIX retorna QR; cartão retorna `invoiceUrl`.
  Future<ArenaSubscriptionResult> createSubscription({
    required String arenaId,
    required ArenaPlanTier tier,
    required ArenaBillingCycle cycle,
    required ArenaSubscriptionMethod method,
    String? cpfCnpj,
  }) async {
    if (arenaId.trim().isEmpty) {
      throw ArenaSubscriptionException('Arena inválida.');
    }
    try {
      final payload = <String, dynamic>{
        'arenaId': arenaId.trim(),
        'tier': tier.id,
        'cycle': cycle.id,
        'billingType': method.billingType,
      };
      final doc = CpfCnpjValidator.normalize(cpfCnpj ?? '');
      if (CpfCnpjValidator.isValid(doc)) {
        payload['cpfCnpj'] = doc;
      }
      final raw =
          await _functions.httpsCallable('createArenaSubscription').call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw ArenaSubscriptionException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final subscriptionId = (map['subscriptionId'] as String?)?.trim() ?? '';
      if (subscriptionId.isEmpty) {
        throw ArenaSubscriptionException('Não foi possível criar a assinatura.');
      }
      return ArenaSubscriptionResult(
        subscriptionId: subscriptionId,
        paymentId: (map['paymentId'] as String?)?.trim() ?? '',
        billingType: (map['billingType'] as String?)?.trim() ?? method.billingType,
        tier: tier,
        cycle: cycle,
        invoiceUrl: (map['invoiceUrl'] as String?)?.trim().isNotEmpty == true
            ? (map['invoiceUrl'] as String).trim()
            : null,
        qrCode: map['qrCode'] as String?,
        qrCodeBase64: map['qrCodeBase64'] as String?,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaSubscriptionException(_mapFunctionsMessage(e));
    } catch (e) {
      if (e is ArenaSubscriptionException) rethrow;
      throw ArenaSubscriptionException('Não foi possível criar a assinatura: $e');
    }
  }

  Future<void> cancelSubscription(String arenaId) async {
    if (arenaId.trim().isEmpty) return;
    try {
      await _functions
          .httpsCallable('cancelArenaSubscription')
          .call(<String, dynamic>{'arenaId': arenaId.trim()});
    } on FirebaseFunctionsException catch (e) {
      throw ArenaSubscriptionException(_mapFunctionsMessage(e));
    } catch (e) {
      throw ArenaSubscriptionException('Não foi possível cancelar: $e');
    }
  }

  /// Abre o checkout hospedado Asaas (cartão) no navegador in-app.
  Future<void> openCheckout(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) {
      throw ArenaSubscriptionException('Link de pagamento inválido.');
    }
    final mode = kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppWebView;
    final ok = await launchUrl(uri, mode: mode);
    if (!ok) {
      final fallback = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!fallback) {
        throw ArenaSubscriptionException('Não foi possível abrir o pagamento.');
      }
    }
  }

  static String _mapFunctionsMessage(FirebaseFunctionsException e) {
    final detail = e.message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para continuar.';
      case 'permission-denied':
        return detail ?? 'Você não gerencia esta arena.';
      case 'not-found':
        return 'Arena não encontrada.';
      case 'invalid-argument':
        return detail ?? 'Dados inválidos.';
      case 'failed-precondition':
        return detail ?? 'Não foi possível gerar a cobrança.';
      case 'internal':
        return detail ?? 'Erro no servidor. Tente novamente.';
      default:
        return detail ?? 'Erro ao processar a assinatura (${e.code}).';
    }
  }
}
