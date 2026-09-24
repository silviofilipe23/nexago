// Finding 1 (revisão final RBAC equipe/arena): `saveProfile` reenviava
// incondicionalmente `paymentReceiver`/`payoutPixKey`/`payoutPixKeyType` — os
// três campos que `firestore.rules:996-1002` congela para não-donos exigindo
// igualdade campo a campo com o valor já salvo. Este branch é o primeiro a
// abrir `/arena/profile/edit` para `gestor` (área `perfil`), e a igualdade
// falha na prática por dois caminhos independentes:
//   - `paymentReceiver` nunca é escrito em lugar nenhum do repositório (só
//     lido em `functions/src/mercadopago-arena-helpers.ts:32`) → arena sem o
//     campo tem `null` salvo, o app manda `'platform'` → diverge;
//   - `PayoutPixKeyType.initial()` nunca devolve vazio (cai em
//     `inferFromKey`, que responde `email` até para chave vazia) → arena sem
//     PIX configurado tem `null` salvo, o app manda `'EMAIL'` → diverge.
// Qualquer um dos dois derruba o `set(merge: true)` INTEIRO — nome,
// endereço, esportes, capa, nada salva. Este teste é do SERVIÇO (não de
// widget): captura o mapa cru entregue a `.set()` via um fake mínimo de
// `FirebaseFirestore` (mesmo padrão de
// `test/core/profiles/users_repository_signup_doc_test.dart`) e afirma que
// os três campos somem do payload quando `isOwner: false`.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/data/arena_profile_edit_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';

void main() {
  Future<Map<String, dynamic>> saveAndCapture({required bool isOwner}) async {
    final firestore = _CapturingFirestore();
    final service = ArenaProfileEditService(firestore);

    await service.saveProfile(
      arenaId: 'a1',
      isOwner: isOwner,
      name: 'Arena Vegeton',
      description: 'Quadras de areia',
      phone: '62999998888',
      address: 'Rua das Quadras, 100',
      city: 'Goiânia',
      state: 'GO',
      courtTypes: const ['Beach Tennis'],
      onlinePaymentEnabled: false,
      onsitePaymentEnabled: true,
    );

    expect(firestore.lastSetData, isNotNull);
    return firestore.lastSetData!;
  }

  test(
    'nao-dono (gestor): payload nao contem os campos congelados pela rule',
    () async {
      final data = await saveAndCapture(isOwner: false);

      expect(data.containsKey('paymentReceiver'), isFalse);
      expect(data.containsKey('payoutPixKey'), isFalse);
      expect(data.containsKey('payoutPixKeyType'), isFalse);

      // O resto do perfil continua indo — a omissão é só dos 3 campos.
      expect(data['name'], 'Arena Vegeton');
      expect(data['address'], 'Rua das Quadras, 100');
      expect(data['city'], 'Goiânia');
    },
  );

  test('dono: payload contem os 3 campos', () async {
    final data = await saveAndCapture(isOwner: true);

    expect(
        data['paymentReceiver'], ArenaPaymentReceiver.platform.firestoreValue);
    expect(data.containsKey('payoutPixKey'), isTrue);
    expect(data.containsKey('payoutPixKeyType'), isTrue);
  });
}

/// Fake mínimo de [FirebaseFirestore]: só o suficiente para capturar o mapa
/// cru passado a `.set()` em `arenas/{id}`, sem tocar Firestore de verdade.
/// Copiado do padrão de `test/core/profiles/users_repository_signup_doc_test.dart`.
class _CapturingFirestore implements FirebaseFirestore {
  Map<String, dynamic>? lastSetData;
  SetOptions? lastSetOptions;

  @override
  CollectionReference<Map<String, dynamic>> collection(String collectionPath) {
    return _CapturingCollection(this);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _CapturingCollection
    implements CollectionReference<Map<String, dynamic>> {
  _CapturingCollection(this._firestore);

  final _CapturingFirestore _firestore;

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) {
    return _CapturingDocRef(_firestore);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _CapturingDocRef implements DocumentReference<Map<String, dynamic>> {
  _CapturingDocRef(this._firestore);

  final _CapturingFirestore _firestore;

  @override
  Future<void> set(Map<String, dynamic> data, [SetOptions? options]) async {
    _firestore.lastSetData = data;
    _firestore.lastSetOptions = options;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
