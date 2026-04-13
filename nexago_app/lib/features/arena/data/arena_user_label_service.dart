import 'package:cloud_firestore/cloud_firestore.dart';

/// Cache simples de nome/e-mail de usuário para evitar leituras repetidas.
class ArenaUserLabelService {
  ArenaUserLabelService(this._firestore);

  final FirebaseFirestore _firestore;
  final Map<String, String> _cache = <String, String>{};
  final Map<String, Future<String>> _inFlight = <String, Future<String>>{};

  Future<String> getLabel(String athleteId) {
    final uid = athleteId.trim();
    if (uid.isEmpty) {
      return Future<String>.value('—');
    }
    final cached = _cache[uid];
    if (cached != null) {
      return Future<String>.value(cached);
    }
    final pending = _inFlight[uid];
    if (pending != null) {
      return pending;
    }

    final future = _fetch(uid);
    _inFlight[uid] = future;
    return future;
  }

  Future<String> _fetch(String uid) async {
    try {
      final snap = await _firestore.collection('users').doc(uid).get();
      final data = snap.data();
      if (data != null) {
        final fullName = (data['fullName'] as String?)?.trim();
        if (fullName != null && fullName.isNotEmpty) {
          _cache[uid] = fullName;
          return fullName;
        }
        final displayName = (data['displayName'] as String?)?.trim();
        if (displayName != null && displayName.isNotEmpty) {
          _cache[uid] = displayName;
          return displayName;
        }
        final email = (data['email'] as String?)?.trim();
        if (email != null && email.isNotEmpty) {
          _cache[uid] = email;
          return email;
        }
      }
    } catch (_) {
      // permission-denied ou rede: retorna fallback abaixo.
    } finally {
      _inFlight.remove(uid);
    }

    final fallback = _athleteFallback(uid);
    _cache[uid] = fallback;
    return fallback;
  }

  static String _athleteFallback(String uid) {
    if (uid.length <= 8) return 'Atleta ($uid)';
    return 'Atleta (…${uid.substring(uid.length - 6)})';
  }
}
