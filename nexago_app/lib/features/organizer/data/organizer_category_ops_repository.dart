import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../domain/category_ops/category_ops_logic.dart';
import '../domain/category_ops/category_ops_models.dart';

class OrganizerCategoryOpsRepository {
  OrganizerCategoryOpsRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  Future<CategoryOpsState> getCategoryOps({
    required String tournamentId,
    required String categoryId,
  }) async {
    final snap = await _tournaments.doc(tournamentId.trim()).get();
    if (!snap.exists) return const CategoryOpsState();
    final data = snap.data();
    if (data == null) return const CategoryOpsState();
    final opsRaw = data['categoryOps'];
    if (opsRaw is! Map) return const CategoryOpsState();
    final categoryOps = Map<String, dynamic>.from(opsRaw);
    final raw = categoryOps[categoryId.trim()];
    if (raw is! Map) return const CategoryOpsState();
    return categoryOpsFromMap(Map<String, dynamic>.from(raw));
  }

  Stream<CategoryOpsState> watchCategoryOps({
    required String tournamentId,
    required String categoryId,
  }) {
    final tid = tournamentId.trim();
    final cid = categoryId.trim();
    if (tid.isEmpty || cid.isEmpty) {
      return Stream.value(const CategoryOpsState());
    }
    return _tournaments.doc(tid).snapshots().map((snap) {
      if (!snap.exists) return const CategoryOpsState();
      final data = snap.data();
      if (data == null) return const CategoryOpsState();
      final opsRaw = data['categoryOps'];
      if (opsRaw is! Map) return const CategoryOpsState();
      final categoryOps = Map<String, dynamic>.from(opsRaw);
      final raw = categoryOps[cid];
      if (raw is! Map) return const CategoryOpsState();
      return categoryOpsFromMap(Map<String, dynamic>.from(raw));
    });
  }

  Future<void> saveCategoryOps({
    required String tournamentId,
    required String categoryId,
    required CategoryOpsState state,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    final tid = tournamentId.trim();
    final cid = categoryId.trim();
    await _tournaments.doc(tid).set({
      'categoryOps': {
        cid: {
          ...categoryOpsToMap(state),
          'updatedAt': FieldValue.serverTimestamp(),
        },
      },
    }, SetOptions(merge: true));
  }

  Future<Map<String, dynamic>?> getCategory({
    required String tournamentId,
    required String categoryId,
  }) async {
    final snap = await _tournaments.doc(tournamentId.trim()).get();
    if (!snap.exists) return null;
    final data = snap.data();
    if (data == null) return null;
    final categoriesRaw = data['categories'];
    if (categoriesRaw is! List) return null;
    for (final item in categoriesRaw) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item);
      final id = (map['id'] as String?) ?? (map['categoryName'] as String?);
      if (id == categoryId.trim()) return map;
    }
    return null;
  }
}
