import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

class OrganizerTournamentOpsRepository {
  OrganizerTournamentOpsRepository(
    this._firestore,
    this._auth, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  String? get _uid => _auth.currentUser?.uid;

  Future<Map<String, dynamic>?> getTournament(String tournamentId) async {
    final id = tournamentId.trim();
    if (id.isEmpty) return null;
    final snap = await _tournaments.doc(id).get();
    if (!snap.exists) return null;
    return {'id': snap.id, ...?snap.data()};
  }

  Stream<Map<String, dynamic>?> watchTournament(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _tournaments.doc(id).snapshots().map((snap) {
      if (!snap.exists) return null;
      return {'id': snap.id, ...?snap.data()};
    });
  }

  Future<void> closeTournamentRegistrations(String tournamentId) async {
    final callable = _functions.httpsCallable('closeTournamentRegistrations');
    await callable.call({'tournamentId': tournamentId.trim()});
  }

  Future<void> cancelTournament(String tournamentId) async {
    final callable = _functions.httpsCallable('cancelTournament');
    await callable.call({'tournamentId': tournamentId.trim()});
  }

  Future<void> patchListingStatus({
    required String tournamentId,
    required String listingStatus,
  }) async {
    final uid = _uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    final id = tournamentId.trim();
    await _tournaments.doc(id).update({
      'listingStatus': listingStatus,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> closeAllCategoryRegistrations(String tournamentId) async {
    final uid = _uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    final snap = await _tournaments.doc(tournamentId.trim()).get();
    if (!snap.exists) throw StateError('Torneio não encontrado.');
    final data = snap.data();
    if (data == null) return;
    final categoriesRaw = data['categories'];
    if (categoriesRaw is! List) return;
    final categories = <Map<String, dynamic>>[];
    for (final item in categoriesRaw) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item);
      map['registrationClosed'] = true;
      categories.add(map);
    }
    await _tournaments.doc(tournamentId.trim()).update({
      'categories': categories,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
