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
    final docRef = _users.doc(profile.id);
    final snap = await docRef.get();
    final exists = snap.exists;

    final data = <String, dynamic>{
      ...profile.toFirestore(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (!exists) {
      // Primeiro save (ex.: onboarding): define papel de atleta.
      data['role'] = 'athlete';
      data['roles'] = ['athlete'];
    }

    // FieldValue.delete() em documento inexistente falha no Firestore.
    final cover = profile.coverPhotoUrl?.trim();
    if (exists && (cover == null || cover.isEmpty)) {
      data['coverPhotoUrl'] = FieldValue.delete();
    }

    await docRef.set(data, SetOptions(merge: true));
  }

  /// Upload em `profiles/{uid}/avatar.jpg` (regras do Storage) e retorna a URL.
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('profiles')
        .child(uid)
        .child('avatar.jpg');
    await ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    return ref.getDownloadURL();
  }

  /// Upload em `profiles/{uid}/cover.jpg` e retorna a URL de download.
  Future<String> uploadCoverPhoto({
    required String uid,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('profiles')
        .child(uid)
        .child('cover.jpg');
    await ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    return ref.getDownloadURL();
  }
}
