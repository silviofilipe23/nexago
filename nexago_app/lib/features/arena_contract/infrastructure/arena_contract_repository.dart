import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../schedule_plans/domain/schedule_plan_models.dart' show spMap;
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/arena_contract.dart';

/// Falha da callable com a frase do servidor (o `toString` é só a frase, para o
/// `friendlyErrorMessage` mostrar como veio).
class ArenaContractException implements Exception {
  ArenaContractException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Meu contrato: o contrato é fechado nas rules (tem anotação interna da
/// arena); o atleta lê pela callable. O espelho `arenaCrmMembers/{uid}` (só
/// leitura do dono) diz, com uma leitura, se ele tem contrato.
class ArenaContractRepository {
  ArenaContractRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _db = firestore,
        _functionsOverride = functions;

  final FirebaseFirestore _db;
  final FirebaseFunctions? _functionsOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  /// `true` quando a arena registrou contrato de mensalista para o atleta.
  Stream<bool> watchHasContract(String uid) => _db
      .collection('arenaCrmMembers')
      .doc(uid)
      .snapshots()
      .map((s) => s.exists);

  Future<MyArenaContracts> myContracts() async {
    try {
      final result = await _functions
          .httpsCallable('getMyArenaContracts')
          .call<Object?>(const <String, Object?>{});
      return MyArenaContracts.fromMap(spMap(result.data));
    } on FirebaseFunctionsException catch (e) {
      throw ArenaContractException(
        callableErrorMessage(
            e.code, e.message, 'Não foi possível abrir o seu contrato.'),
      );
    }
  }
}
