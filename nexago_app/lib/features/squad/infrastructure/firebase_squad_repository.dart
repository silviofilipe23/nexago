import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/squad_models.dart';
import '../domain/squad_repository.dart';

/// NexaSquad no Firebase: flag em `appConfig/squad` e as callables do atleta
/// (região do cliente, `nexagoFunctions`).
class FirebaseSquadRepository implements SquadRepository {
  FirebaseSquadRepository(this._db, {FirebaseFunctions? functions})
    : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  static const String _fallback =
      'Não foi possível falar com o NexaSquad. Tente de novo em instantes.';

  @override
  Stream<bool> watchEnabled() => _db
      .doc('appConfig/squad')
      .snapshots()
      .map((snap) => snap.data()?['enabled'] == true);

  Future<Map<String, Object?>> _call(
    String name, [
    Map<String, Object?> data = const {},
  ]) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      if (raw is! Map) return const {};
      return raw.map((k, v) => MapEntry(k.toString(), v));
    } on FirebaseFunctionsException catch (e) {
      final details = e.details;
      final field = details is Map
          ? details['fields'] ?? details['field']
          : null;
      throw SquadException(
        callableErrorMessage(e.code, e.message, _fallback),
        field: field is List && field.isNotEmpty
            ? field.first.toString()
            : field is String
            ? field
            : null,
      );
    }
  }

  @override
  Future<MySquad> fetchMySquad() async =>
      MySquad.fromMap(await _call('getMySquad'));

  @override
  Future<SquadRanking> fetchRanking() async =>
      SquadRanking.fromMap(await _call('getSquadRanking'));

  @override
  Future<SquadInvite> viewInvite(String inviteId) async => SquadInvite.fromMap(
    await _call('viewSquadInvite', {'inviteId': inviteId}),
  );

  @override
  Future<void> acceptInvite({
    required String inviteId,
    required String code,
  }) async {
    await _call('acceptSquadInvite', {'inviteId': inviteId, 'code': code});
  }

  @override
  Future<void> acceptAmendment() async {
    await _call('acceptSquadAmendment');
  }

  @override
  Future<SquadCodeCheck> checkCode({
    required String code,
    required List<String> athleteUids,
    required String registrationId,
  }) async => SquadCodeCheck.fromMap(
    await _call('checkSquadCode', {
      'code': code,
      'athleteUids': athleteUids,
      'registrationId': registrationId,
    }),
  );
}

final squadRepositoryProvider = Provider<SquadRepository>((ref) {
  return FirebaseSquadRepository(ref.watch(firestoreProvider));
});
