import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/athlete_notification_preferences.dart';
import '../domain/athlete_privacy_preferences.dart';
import '../domain/athlete_profile.dart';
import '../domain/profile_completion_models.dart';

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

    final stepsComplete = ProfileCompletionState.fromProfile(profile).allComplete;
    final data = <String, dynamic>{
      ...profile.toFirestore(),
      'city': profile.city.trim(),
      if (stepsComplete || profile.isProfileComplete) 'isProfileComplete': true,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final stateTrim = profile.state?.trim() ?? '';
    if (stateTrim.isNotEmpty) {
      data['state'] = stateTrim.toUpperCase();
    } else if (exists) {
      data['state'] = FieldValue.delete();
    }

    final nicknameTrim = profile.nickname?.trim() ?? '';
    if (nicknameTrim.isNotEmpty) {
      data['nickname'] = nicknameTrim;
    } else if (exists) {
      data['nickname'] = FieldValue.delete();
    }

    final authUser = FirebaseAuth.instance.currentUser;
    if (authUser != null && authUser.uid == profile.id) {
      final email = authUser.email?.trim();
      if (email != null && email.isNotEmpty) {
        data['email'] = email;
      }
    }

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

  Future<void> saveNotificationPreferences({
    required String uid,
    required AthleteNotificationPreferences preferences,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'notificationPreferences': preferences.toFirestore(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> savePrivacyPreferences({
    required String uid,
    required AthletePrivacyPreferences preferences,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'privacyPreferences': preferences.toFirestore(),
        'publicProfileEnabled': preferences.publicProfileEnabled,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Stream<List<Map<String, dynamic>>> watchUserTokens(String uid) {
    return _users
        .doc(uid)
        .collection('tokens')
        .snapshots()
        .map((snap) => snap.docs.map((d) => {...d.data(), 'id': d.id}).toList());
  }

  Future<void> deleteUserToken({
    required String uid,
    required String tokenId,
  }) async {
    await _users.doc(uid).collection('tokens').doc(tokenId).delete();
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
