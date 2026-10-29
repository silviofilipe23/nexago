import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/firebase/functions_region.dart';
import '../domain/category_ops/category_ops_models.dart';

@immutable
class OrganizerTournamentContacts {
  const OrganizerTournamentContacts({
    this.phones = const {},
    this.twinPairs = const [],
  });

  /// `uid` → telefone cru do cadastro.
  final Map<String, String> phones;
  final List<OrganizerTwinPair> twinPairs;
}

class _CachedContacts {
  _CachedContacts(this.contacts, this.coveredUids);

  final OrganizerTournamentContacts contacts;
  final Set<String> coveredUids;
}

/// Contatos dos atletas inscritos, via callable `getTournamentAthleteContacts`
/// (ACL do torneio no backend). Com `users` restrito e o espelho
/// `public_profiles` sem PII, este é o canal de telefone do organizador — e
/// dos pares de "possível duplicado", que saem do mesmo cadastro.
class OrganizerContactsService {
  OrganizerContactsService({required FirebaseFunctions functions})
      : _functions = functions;

  final FirebaseFunctions _functions;
  final Map<String, _CachedContacts> _byTournament = {};

  /// Telefones e pares do torneio. Cache por torneio na sessão, refeito só
  /// quando aparece em [uids] atleta que a última busca não cobria — sem isso
  /// o par da inscrição que acabou de entrar nunca chegava. Falha devolve o
  /// que já havia (ou vazio): a operação segue sem contato e sem aviso.
  Future<OrganizerTournamentContacts> contactsForTournament(
    String tournamentId, {
    Iterable<String> uids = const [],
  }) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return const OrganizerTournamentContacts();
    final cached = _byTournament[tid];
    if (cached != null && uids.every(cached.coveredUids.contains)) {
      return cached.contacts;
    }

    try {
      final result = await _functions
          .httpsCallable('getTournamentAthleteContacts')
          .call<Map<String, dynamic>>({'tournamentId': tid});
      final contacts = OrganizerTournamentContacts(
        phones: _parsePhones(result.data['contacts']),
        twinPairs: _parseTwinPairs(result.data['twinPairs']),
      );
      _byTournament[tid] = _CachedContacts(contacts, {
        ...?cached?.coveredUids,
        ...uids,
      });
      return contacts;
    } catch (_) {
      return cached?.contacts ?? const OrganizerTournamentContacts();
    }
  }

  static Map<String, String> _parsePhones(Object? contacts) {
    final phones = <String, String>{};
    if (contacts is! Map) return phones;
    for (final entry in contacts.entries) {
      final value = entry.value;
      if (value is! Map) continue;
      final phone = (value['phoneNumber'] as String?)?.trim() ?? '';
      if (phone.isNotEmpty) phones[entry.key.toString()] = phone;
    }
    return phones;
  }

  /// Function antiga (sem o campo) devolve lista vazia: sem aviso.
  static List<OrganizerTwinPair> _parseTwinPairs(Object? raw) {
    if (raw is! List) return const [];
    final pairs = <OrganizerTwinPair>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final regs = _pairOf(item['registrationIds']);
      final uids = _pairOf(item['uids']);
      if (regs == null || uids == null) continue;
      pairs.add(
        OrganizerTwinPair(
          registrationA: regs.$1,
          uidA: uids.$1,
          registrationB: regs.$2,
          uidB: uids.$2,
        ),
      );
    }
    return pairs;
  }

  static (String, String)? _pairOf(Object? raw) {
    if (raw is! List || raw.length != 2) return null;
    final a = raw[0] is String ? (raw[0] as String).trim() : '';
    final b = raw[1] is String ? (raw[1] as String).trim() : '';
    return a.isEmpty || b.isEmpty ? null : (a, b);
  }
}

final organizerContactsServiceProvider =
    Provider<OrganizerContactsService>((ref) {
  return OrganizerContactsService(functions: nexagoFunctions);
});
