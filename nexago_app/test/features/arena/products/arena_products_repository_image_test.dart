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

  @override
  Reference ref([String? path]) => _RejectingRef(code);

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
