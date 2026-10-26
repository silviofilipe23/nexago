import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/home_banner.dart';

/// `appConfig/homeBanners` (o espelho que a callable `saveHomeBanners` grava;
/// a rule de `appConfig` exige sessão) e as marcas do atleta em
/// `users/{uid}/homeBanners/{id}`.
class FirestoreHomeBannersRepository implements HomeBannersRepository {
  FirestoreHomeBannersRepository(this._db);

  final FirebaseFirestore _db;

  @override
  Stream<List<HomeBanner>> watchBanners() => _db
      .doc('appConfig/homeBanners')
      .snapshots()
      .map((snap) => HomeBanner.listFromDoc(snap.data()));

  @override
  Stream<Map<String, HomeBannerMarks>> watchMarks(String uid) => _db
      .collection('users')
      .doc(uid)
      .collection('homeBanners')
      .snapshots()
      .map(
        (snap) => {
          for (final doc in snap.docs)
            doc.id: HomeBannerMarks.fromMap(doc.data()),
        },
      );

  /// `merge`: cria o doc na primeira marca e soma as seguintes sem tocar nas
  /// que já existem (a rule recusa mudar uma marca gravada).
  @override
  Future<void> mark(String uid, String bannerId, HomeBannerMark mark) => _db
      .collection('users')
      .doc(uid)
      .collection('homeBanners')
      .doc(bannerId)
      .set({mark.field: FieldValue.serverTimestamp()}, SetOptions(merge: true));
}
