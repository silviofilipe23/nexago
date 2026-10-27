import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/app_news.dart';

/// `appConfig/appNews` — a rule de `appConfig` exige sessão e não deixa o app
/// gravar; o conteúdo sobe por script (`functions/scripts/seed-app-news.js`).
class FirestoreAppNewsRepository implements AppNewsRepository {
  FirestoreAppNewsRepository(this._db);

  final FirebaseFirestore _db;

  @override
  Stream<List<AppNewsRelease>> watchReleases() => _db
      .doc('appConfig/appNews')
      .snapshots()
      .map((snap) => AppNewsRelease.listFromDoc(snap.data()));
}
