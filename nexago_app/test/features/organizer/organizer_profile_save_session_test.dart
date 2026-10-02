import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_editor_logic.dart';
import 'package:nexago_app/features/organizer/domain/public_profile/organizer_profile_save_session.dart';

const _source = OrganizerProfileSource(
  orgName: 'Liga Amadora Goiânia',
  logoUrl: 'https://x/logo-v1.jpg',
  coverUrl: 'https://x/cover-v1.jpg',
  bio: 'Ligas de areia.',
  city: 'Goiânia',
  state: 'GO',
);

/// Registra a ordem das chamadas e falha onde mandarem.
class _Backend {
  final calls = <String>[];
  final persisted = <Map<String, Object>>[];
  bool failCoverUpload = false;
  bool failNextPersist = false;
  bool failFieldsPersist = false;

  Future<String> uploadLogo(Uint8List bytes) async {
    calls.add('upload:logo');
    return 'https://x/logo-v2.jpg';
  }

  Future<String> uploadCover(Uint8List bytes) async {
    calls.add('upload:cover');
    if (failCoverUpload) throw Exception('upload caiu');
    return 'https://x/cover-v2.jpg';
  }

  Future<void> persist(Map<String, Object> update) async {
    calls.add('persist:${update.keys.join('+')}');
    if (failNextPersist) {
      failNextPersist = false;
      throw Exception('update caiu');
    }
    if (failFieldsPersist && update.containsKey('organizerProfile.bio')) {
      throw Exception('update caiu');
    }
    persisted.add(update);
  }

  Future<void> save(
    OrganizerProfileSaveSession session,
    OrganizerProfileForm form,
  ) => session.save(
    form,
    uploadLogo: uploadLogo,
    uploadCover: uploadCover,
    persist: persist,
  );
}

final _bytes = Uint8List.fromList([1, 2, 3]);

void main() {
  test('logo e capa: cada um sobe e grava na hora; depois os campos', () async {
    final backend = _Backend();
    final session = OrganizerProfileSaveSession(_source)
      ..pickLogo(_bytes)
      ..pickCover(_bytes);
    final form = OrganizerProfileForm.fromSource(
      _source,
    ).copyWith(bio: 'Nova bio');
    expect(session.isDirty(form), isTrue);

    await backend.save(session, form);

    expect(backend.calls, [
      'upload:logo',
      'persist:organizerProfile.logoUrl',
      'upload:cover',
      'persist:organizerProfile.coverUrl',
      'persist:organizerProfile.bio',
    ]);
    expect(session.baseline.logoUrl, 'https://x/logo-v2.jpg');
    expect(session.baseline.coverUrl, 'https://x/cover-v2.jpg');
    expect(session.baseline.bio, 'Nova bio');
    expect(session.isDirty(form), isFalse);
  });

  test(
    'capa falha no upload: o logo já ficou gravado e não sobe de novo na nova tentativa',
    () async {
      final backend = _Backend()..failCoverUpload = true;
      final session = OrganizerProfileSaveSession(_source)
        ..pickLogo(_bytes)
        ..pickCover(_bytes);
      final form = OrganizerProfileForm.fromSource(
        _source,
      ).copyWith(bio: 'Nova bio');

      await expectLater(backend.save(session, form), throwsException);
      // O logo novo já está no doc: a URL gravada é a do arquivo novo, nunca a antiga
      // apontando para o arquivo sobrescrito.
      expect(backend.persisted, [
        {'organizerProfile.logoUrl': 'https://x/logo-v2.jpg'},
      ]);
      expect(session.logo, isNull);
      expect(session.baseline.logoUrl, 'https://x/logo-v2.jpg');
      expect(session.cover, isNotNull);
      expect(session.isDirty(form), isTrue);

      backend
        ..failCoverUpload = false
        ..calls.clear();
      await backend.save(session, form);
      expect(backend.calls, [
        'upload:cover',
        'persist:organizerProfile.coverUrl',
        'persist:organizerProfile.bio',
      ]);
    },
  );

  test(
    'update da imagem falha: a nova tentativa grava a URL sem subir de novo',
    () async {
      final backend = _Backend()..failNextPersist = true;
      final session = OrganizerProfileSaveSession(_source)..pickLogo(_bytes);
      final form = OrganizerProfileForm.fromSource(_source);

      await expectLater(backend.save(session, form), throwsException);
      expect(session.logo!.uploadedUrl, 'https://x/logo-v2.jpg');
      expect(session.baseline.logoUrl, 'https://x/logo-v1.jpg');

      backend.calls.clear();
      await backend.save(session, form);
      expect(backend.calls, ['persist:organizerProfile.logoUrl']);
      expect(backend.persisted.single, {
        'organizerProfile.logoUrl': 'https://x/logo-v2.jpg',
      });
      expect(session.logo, isNull);
    },
  );

  test(
    'campos falham depois das imagens: a nova tentativa só manda os campos',
    () async {
      final backend = _Backend()..failFieldsPersist = true;
      final session = OrganizerProfileSaveSession(_source)..pickLogo(_bytes);
      final form = OrganizerProfileForm.fromSource(
        _source,
      ).copyWith(bio: 'Nova bio');

      await expectLater(backend.save(session, form), throwsException);
      backend
        ..failFieldsPersist = false
        ..calls.clear();
      await backend.save(session, form);
      expect(backend.calls, ['persist:organizerProfile.bio']);
    },
  );

  test('remover a capa grava FieldValue.delete() e some da sessão', () async {
    final backend = _Backend();
    final session = OrganizerProfileSaveSession(_source)..markCoverRemoved();
    final form = OrganizerProfileForm.fromSource(_source);
    expect(session.hasCover, isFalse);
    expect(session.isDirty(form), isTrue);

    await backend.save(session, form);
    expect(backend.persisted, [
      {'organizerProfile.coverUrl': FieldValue.delete()},
    ]);
    expect(session.baseline.coverUrl, isNull);
    expect(session.removeCover, isFalse);
    expect(session.isDirty(form), isFalse);
  });

  test('capa nova depois de "remover" desfaz a remoção', () {
    final session = OrganizerProfileSaveSession(_source)
      ..markCoverRemoved()
      ..pickCover(_bytes);
    expect(session.removeCover, isFalse);
    expect(session.hasCover, isTrue);
  });

  test('nada mudou: nada é chamado', () async {
    final backend = _Backend();
    final session = OrganizerProfileSaveSession(_source);
    final form = OrganizerProfileForm.fromSource(_source);
    expect(session.isDirty(form), isFalse);
    await backend.save(session, form);
    expect(backend.calls, isEmpty);
  });
}
