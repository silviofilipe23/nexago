// storage.rules passou a liberar a foto de produto à equipe que grava o
// estoque (gestor e manutenção) com o plano da arena em dia. A recusa que
// sobra no formulário é a da equipe sem plano, e ela não pode chegar na tela
// como `[firebase_storage/unauthorized] ...` cru.
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/data/arena_products_repository.dart';

void main() {
  Future<String> uploadRejectedWith(String code) {
    final repo = ArenaProductsRepository(
      _UnusedFirestore(),
      _UnusedAuth(),
      _RejectingStorage(code),
    );
    return repo.uploadProductImage(
      arenaId: 'a1',
      productId: 'p1',
      bytes: Uint8List(8),
      contentType: 'image/jpeg',
    );
  }

  test('foto recusada pelo Storage: aviso fala do plano, sem o código cru',
      () async {
    await expectLater(
      uploadRejectedWith('unauthorized'),
      throwsA(
        isA<ArenaProductImageException>()
            .having((e) => e.message, 'message', contains('plano da arena'))
            .having((e) => e.message, 'message', isNot(contains('firebase'))),
      ),
    );
  });

  test('foto sobe com nome novo a cada envio, nunca no `{id}.jpg` fixo',
      () async {
    final storage = _RejectingStorage('retry-limit-exceeded');
    final repo =
        ArenaProductsRepository(_UnusedFirestore(), _UnusedAuth(), storage);
    await expectLater(
      repo.uploadProductImage(
        arenaId: 'a1',
        productId: 'p1',
        bytes: Uint8List(8),
        contentType: 'image/jpeg',
      ),
      throwsA(isA<FirebaseException>()),
    );
    expect(
      storage.paths.single,
      matches(RegExp(r'^arenas/a1/products/p1-\d+\.jpg$')),
    );
  });

  group('deleteReplacedProductImage', () {
    Future<List<String>> deletedAfter(String? previous, String? next) async {
      final storage = _DeletingStorage();
      final repo =
          ArenaProductsRepository(_UnusedFirestore(), _UnusedAuth(), storage);
      await repo.deleteReplacedProductImage(
        arenaId: 'a1',
        previousUrl: previous,
        nextUrl: next,
      );
      return storage.deleted;
    }

    const old = 'gs://b/arenas/a1/products/p1.jpg';
    const next = 'gs://b/arenas/a1/products/p1-9.jpg';

    test('foto trocada: apaga a antiga depois do save', () async {
      expect(await deletedAfter(old, next), ['arenas/a1/products/p1.jpg']);
    });

    test('mesma foto, sem foto antiga ou URL externa: não apaga', () async {
      expect(await deletedAfter(next, next), isEmpty);
      expect(await deletedAfter(null, next), isEmpty);
      expect(await deletedAfter('https://example.com/x.jpg', next), isEmpty);
    });

    test('nunca apaga fora da pasta de produtos desta arena', () async {
      expect(await deletedAfter('gs://b/arenas/a1/cover-1', next), isEmpty);
      expect(
        await deletedAfter('gs://b/arenas/a2/products/p1.jpg', next),
        isEmpty,
      );
    });
  });

  test('foto: outra falha do Storage sobe crua', () async {
    await expectLater(
      uploadRejectedWith('retry-limit-exceeded'),
      throwsA(isA<FirebaseException>()),
    );
  });
}

class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedAuth implements FirebaseAuth {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// [FirebaseStorage] cujo `putData` falha com [code], como o SDK faz quando
/// as rules recusam o envio (`unauthorized`).
class _RejectingStorage implements FirebaseStorage {
  _RejectingStorage(this.code);

  final String code;

  /// Caminho que o serviço pediu ao Storage (o nome do arquivo enviado).
  final paths = <String?>[];

  @override
  Reference ref([String? path]) {
    paths.add(path);
    return _RejectingRef(code);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _RejectingRef implements Reference {
  _RejectingRef(this.code);

  final String code;

  @override
  Reference child(String path) => this;

  @override
  UploadTask putData(Uint8List data, [SettableMetadata? metadata]) {
    throw FirebaseException(plugin: 'firebase_storage', code: code);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// [FirebaseStorage] que entende `gs://b/{path}` e registra o que foi apagado.
class _DeletingStorage implements FirebaseStorage {
  final deleted = <String>[];

  @override
  Reference refFromURL(String url) {
    if (!url.startsWith('gs://b/')) {
      throw ArgumentError('URL externa');
    }
    return _DeletingRef(this, url.substring('gs://b/'.length));
  }

  @override
  Reference ref([String? path]) => _DeletingRef(this, path ?? '');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _DeletingRef implements Reference {
  _DeletingRef(this.storage, this.fullPath);

  final _DeletingStorage storage;

  @override
  final String fullPath;

  @override
  Future<void> delete() async => storage.deleted.add(fullPath);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
