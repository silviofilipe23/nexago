import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/story_share/organizer_story_share.dart';

/// Leitura das artes do Stories que o painel web mandou para o celular. Só o
/// servidor grava o envio; a regra do Storage deixa só o dono baixar.
class OrganizerStorySharesRepository {
  OrganizerStorySharesRepository({
    required FirebaseFirestore firestore,
    required FirebaseStorage Function() storage,
  })  : _firestore = firestore,
        _storage = storage;

  final FirebaseFirestore _firestore;
  final FirebaseStorage Function() _storage;

  /// Teto de um PNG 1080×1920 (a regra do Storage recusa acima de 10 MB).
  static const int maxPageBytes = 10 * 1024 * 1024;

  Stream<OrganizerStoryShare?> watchShare(String uid, String shareId) {
    final id = shareId.trim();
    if (uid.isEmpty || id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('users')
        .doc(uid)
        .collection('storyShares')
        .doc(id)
        .snapshots()
        .map((snap) => OrganizerStoryShare.fromMap(snap.id, snap.data()));
  }

  Future<Uint8List> downloadPage(String path) async {
    final bytes = await _storage().ref(path).getData(maxPageBytes);
    if (bytes == null || bytes.isEmpty) {
      throw StateError('Imagem vazia: $path');
    }
    return bytes;
  }
}
