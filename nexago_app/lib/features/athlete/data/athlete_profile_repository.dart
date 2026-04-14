import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/athlete_profile.dart';

class AthleteProfileRepository {
  AthleteProfileRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  Stream<AthleteProfile?> watchProfile(String uid) {
    return _users.doc(uid).snapshots().map((snap) {
      if (!snap.exists || snap.data() == null) return null;
      return AthleteProfile.fromFirestore(snap);
    });
  }

  Future<void> saveProfile(AthleteProfile profile) async {
    await _users.doc(profile.id).set(
          <String, dynamic>{
            ...profile.toFirestore(),
            'updatedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
  }

  /// Upload em `athletes/{uid}/avatar.jpg` e retorna a URL de download.
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('athletes')
        .child(uid)
        .child('avatar.jpg');
    await ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    return ref.getDownloadURL();
  }
}
