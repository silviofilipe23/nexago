import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/public_profile/organizer_profile_editor_logic.dart';

/// Teto de cada envio de imagem: sem ele, uma conexão caída deixa o botão girando por até
/// 10 minutos (a tentativa do SDK).
const Duration kOrganizerImageUploadTimeout = Duration(seconds: 60);

/// Leitura e gravação da origem do perfil público (`users/{uid}.organizerProfile`) e das
/// imagens em `profiles/{uid}/`. Os nomes dos arquivos são os do painel web
/// (`organizer-settings-repository.ts`), para as duas superfícies sobrescreverem o mesmo
/// arquivo.
class OrganizerPublicProfileEditorRepository {
  OrganizerPublicProfileEditorRepository({
    required FirebaseFirestore firestore,
    required FirebaseStorage Function() storage,
  })  : _firestore = firestore,
        _storage = storage;

  final FirebaseFirestore _firestore;

  /// Preguiçoso: a instância do Storage só é criada quando há upload.
  final FirebaseStorage Function() _storage;

  Stream<OrganizerProfileSource> watchSource(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return Stream.value(const OrganizerProfileSource());
    return _firestore
        .collection('users')
        .doc(id)
        .snapshots()
        .map((snap) => OrganizerProfileSource.fromUserDoc(snap.data()));
  }

  /// `update()` com caminhos pontilhados — só o que [buildOrganizerProfileUpdate] devolveu.
  Future<void> save(String uid, Map<String, Object> update) async {
    if (update.isEmpty) return;
    await _firestore.collection('users').doc(uid.trim()).update(update);
  }

  Future<String> uploadLogo(String uid, Uint8List jpegBytes) =>
      _upload('profiles/${uid.trim()}/organizer-logo.jpg', jpegBytes);

  Future<String> uploadCover(String uid, Uint8List jpegBytes) =>
      _upload('profiles/${uid.trim()}/organizer-cover.jpg', jpegBytes);

  Future<String> _upload(String path, Uint8List bytes) async {
    final ref = _storage().ref(path);
    final task = ref.putData(
      bytes,
      SettableMetadata(contentType: 'image/jpeg'),
    );
    try {
      await task.timeout(kOrganizerImageUploadTimeout);
    } on TimeoutException {
      unawaited(task.cancel());
      rethrow;
    }
    return ref.getDownloadURL().timeout(kOrganizerImageUploadTimeout);
  }
}
