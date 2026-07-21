import 'package:cloud_functions/cloud_functions.dart';

/// Peça na quadra — chama a Cloud Function `addAppOrderItem`
/// (`functions/src/arena-comanda-app-orders.ts`). O client nunca escreve
/// direto em `arenaComandas/*\/items`; essa function é o único caminho.
class ArenaAppOrdersService {
  ArenaAppOrdersService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<AddAppOrderItemResult> addItem({
    required String arenaId,
    required String comandaId,
    required String productId,
    required int quantity,
  }) async {
    if (arenaId.trim().isEmpty ||
        comandaId.trim().isEmpty ||
        productId.trim().isEmpty) {
      throw ArenaAppOrdersException('Dados do pedido inválidos.');
    }
    if (quantity <= 0) {
      throw ArenaAppOrdersException('Quantidade inválida.');
    }

    try {
      final result = await _functions.httpsCallable('addAppOrderItem').call(
        <String, dynamic>{
          'arenaId': arenaId.trim(),
          'comandaId': comandaId.trim(),
          'productId': productId.trim(),
          'quantity': quantity,
        },
      );
      final data = result.data;
      if (data is! Map) {
        throw ArenaAppOrdersException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      return AddAppOrderItemResult(
        itemId: (map['itemId'] as String?) ?? '',
        lineTotalCents: (map['lineTotalCents'] as num?)?.toInt() ?? 0,
        newItemsTotalCents: (map['newItemsTotalCents'] as num?)?.toInt() ?? 0,
        newTotalCents: (map['newTotalCents'] as num?)?.toInt() ?? 0,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaAppOrdersException(_mapFunctionsMessage(e));
    }
  }

  static String _mapFunctionsMessage(FirebaseFunctionsException e) {
    final detail = e.message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para pedir pelo app.';
      case 'permission-denied':
        return detail ?? 'Sem permissão para pedir nesta comanda.';
      case 'not-found':
        return detail ?? 'Comanda ou produto não encontrado.';
      case 'invalid-argument':
        return detail ?? 'Dados do pedido inválidos.';
      case 'failed-precondition':
        return detail ?? 'Não foi possível concluir o pedido.';
      default:
        return detail ?? 'Não foi possível concluir o pedido (${e.code}).';
    }
  }
}

class AddAppOrderItemResult {
  const AddAppOrderItemResult({
    required this.itemId,
    required this.lineTotalCents,
    required this.newItemsTotalCents,
    required this.newTotalCents,
  });

  final String itemId;
  final int lineTotalCents;
  final int newItemsTotalCents;
  final int newTotalCents;
}

class ArenaAppOrdersException implements Exception {
  ArenaAppOrdersException(this.message);

  final String message;

  @override
  String toString() => message;
}
