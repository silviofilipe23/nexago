import 'package:cloud_functions/cloud_functions.dart';

import '../domain/arena_coupon.dart';

class CouponsException implements Exception {
  CouponsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Gestão de cupons de marketing da arena (lado gestor) — callables em
/// `functions/src/arena-coupons.ts` (criar/listar/desativar). Diferente de
/// `PromotionsRepository`, que escreve direto no Firestore: cupom precisa
/// validar vigência/limite/XOR de desconto e checar resgates de forma
/// atômica, então toda escrita passa por Cloud Functions.
class CouponsRepository {
  CouponsRepository({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<List<ArenaCoupon>> listCoupons(String arenaId) async {
    final id = arenaId.trim();
    if (id.isEmpty) return const [];
    try {
      final raw = await _functions
          .httpsCallable('listArenaCoupons')
          .call(<String, dynamic>{'arenaId': id});
      final data = raw.data;
      if (data is! Map) return const [];
      final list = data['coupons'];
      if (list is! List) return const [];
      return list
          .whereType<Map>()
          .map((m) => ArenaCoupon.fromMap(Map<String, dynamic>.from(m)))
          .toList();
    } on FirebaseFunctionsException catch (e) {
      throw CouponsException(_mapFunctionsMessage(e));
    }
  }

  /// Cria um cupom. `discountPercent` OU `fixedDiscountReais` (XOR, validado
  /// no servidor). `maxRedemptionsPerAthlete` default 1.
  Future<String> createCoupon({
    required String arenaId,
    required String code,
    double? discountPercent,
    double? fixedDiscountReais,
    DateTime? validFrom,
    DateTime? validUntil,
    int? maxRedemptionsTotal,
    int maxRedemptionsPerAthlete = 1,
  }) async {
    try {
      final payload = <String, dynamic>{
        'arenaId': arenaId.trim(),
        'code': code.trim(),
        'maxRedemptionsPerAthlete': maxRedemptionsPerAthlete,
        if (discountPercent != null) 'discountPercent': discountPercent,
        if (fixedDiscountReais != null)
          'fixedDiscountReais': fixedDiscountReais,
        if (validFrom != null) 'validFrom': validFrom.toIso8601String(),
        if (validUntil != null) 'validUntil': validUntil.toIso8601String(),
        if (maxRedemptionsTotal != null)
          'maxRedemptionsTotal': maxRedemptionsTotal,
      };
      final raw =
          await _functions.httpsCallable('createArenaCoupon').call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw CouponsException('Resposta inválida do servidor.');
      }
      final couponId = (data['couponId'] as String?)?.trim() ?? '';
      if (couponId.isEmpty) {
        throw CouponsException('Não foi possível criar o cupom.');
      }
      return couponId;
    } on FirebaseFunctionsException catch (e) {
      throw CouponsException(_mapFunctionsMessage(e));
    }
  }

  /// Desativa o cupom (ação unidirecional — reativar exige criar outro código).
  Future<void> deactivateCoupon({
    required String arenaId,
    required String couponId,
  }) async {
    try {
      await _functions
          .httpsCallable('deactivateArenaCoupon')
          .call(<String, dynamic>{
        'arenaId': arenaId.trim(),
        'couponId': couponId.trim(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw CouponsException(_mapFunctionsMessage(e));
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
        return detail ?? 'Não encontrado.';
      case 'already-exists':
        return detail ?? 'Já existe um cupom com este código.';
      case 'invalid-argument':
        return detail ?? 'Dados inválidos.';
      case 'failed-precondition':
        return detail ?? 'Não foi possível concluir.';
      case 'internal':
        return detail ?? 'Erro no servidor. Tente novamente.';
      default:
        return detail ?? 'Erro ao processar (${e.code}).';
    }
  }
}
