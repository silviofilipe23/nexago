import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/app_guide.dart';

/// `appConfig/appGuide` — a rule de `appConfig` exige sessão e não deixa o app
/// gravar; o conteúdo sobe por script (`functions/scripts/seed-app-guide.js`).
class FirestoreAppGuideRepository implements AppGuideRepository {
  FirestoreAppGuideRepository(this._db);

  final FirebaseFirestore _db;

  @override
  Stream<List<AppGuideCategory>> watchCategories() => _db
      .doc('appConfig/appGuide')
      .snapshots()
      .map((snap) => AppGuideCategory.listFromDoc(snap.data()));
}
