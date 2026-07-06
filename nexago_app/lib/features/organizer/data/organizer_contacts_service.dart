import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Contatos dos atletas inscritos, via callable `getTournamentAthleteContacts`
/// (ACL do torneio no backend). Com `users` restrito e o espelho
/// `public_profiles` sem PII, este é o canal de telefone do organizador.
class OrganizerContactsService {
  OrganizerContactsService({required FirebaseFunctions functions})
      : _functions = functions;

  final FirebaseFunctions _functions;
  final Map<String, Map<String, String>> _phonesByTournament = {};

  /// Telefones dos inscritos (`uid` → telefone). Cache por torneio na sessão;
  /// falha vira mapa vazio — a operação segue sem o botão de contato.
  Future<Map<String, String>> phonesForTournament(String tournamentId) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return const {};
    final cached = _phonesByTournament[tid];
    if (cached != null) return cached;

    try {
      final result = await _functions
          .httpsCallable('getTournamentAthleteContacts')
          .call<Map<String, dynamic>>({'tournamentId': tid});
      final contacts = result.data['contacts'];
      final phones = <String, String>{};
      if (contacts is Map) {
        for (final entry in contacts.entries) {
          final value = entry.value;
          if (value is! Map) continue;
          final phone = (value['phoneNumber'] as String?)?.trim() ?? '';
          if (phone.isNotEmpty) phones[entry.key.toString()] = phone;
        }
      }
      _phonesByTournament[tid] = phones;
      return phones;
    } catch (_) {
      return const {};
    }
  }
}

final organizerContactsServiceProvider =
    Provider<OrganizerContactsService>((ref) {
  return OrganizerContactsService(functions: FirebaseFunctions.instance);
});
