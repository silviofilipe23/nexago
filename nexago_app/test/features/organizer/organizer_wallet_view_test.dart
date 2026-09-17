import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';

void main() {
  group('OrganizerWalletView.fromCallable', () {
    test('lê os caixas por torneio e o perfil de quem chamou', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        ],
        'selected': {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        'payout': {'pixKey': 'a@b.com', 'pixKeyType': 'EMAIL', 'hasPixKey': true},
        'ledger': [
          {'id': 'l1', 'netReais': 92, 'grossReais': 100, 'platformFeeReais': 8, 'createdAt': '2026-09-16T12:00:00.000Z', 'athleteLabel': 'Ana Paula'},
        ],
        'withdrawals': [
          {'id': 'w1', 'amountReais': 40, 'status': 'pending', 'pixKey': '123••••••01', 'requestedBy': 'outro', 'requestedByStaff': true, 'createdAt': '2026-09-16T13:00:00.000Z'},
        ],
      });

      expect(view.cashBoxes.length, 1);
      expect(view.selected?.tournamentId, 't2');
      expect(view.selected?.availableReais, 90);
      expect(view.payout.hasPixKey, isTrue);
      expect(view.ledger.single.athleteLabel, 'Ana Paula');
      expect(view.withdrawals.single.pixKey, '123••••••01');
    });

    test('sem caixa acessível devolve lista vazia e selecionado nulo', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': <dynamic>[],
        'selected': null,
        'payout': {'pixKey': '', 'pixKeyType': '', 'hasPixKey': false},
        'ledger': <dynamic>[],
        'withdrawals': <dynamic>[],
      });

      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.payout.hasPixKey, isFalse);
    });

    test('payload vazio não estoura', () {
      final view = OrganizerWalletView.fromCallable(const <String, dynamic>{});
      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.ledger, isEmpty);
      expect(view.withdrawals, isEmpty);
      expect(view.payout.pixKey, '');
    });

    test('data inválida no extrato vira nulo em vez de estourar', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'ledger': [
          {'id': 'l1', 'createdAt': 'não é data'},
        ],
      });
      expect(view.ledger.single.createdAt, isNull);
    });

    test('número que vem como string ainda soma', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't1', 'tournamentName': 'Copa A', 'availableReais': '12.5', 'pendingReais': 0},
        ],
      });
      expect(view.cashBoxes.single.availableReais, 12.5);
    });
  });

  // A callable nunca vê a chave PIX de saque: o destino é sempre o perfil de
  // quem pede, resolvido no servidor (`organizerPayoutProfiles/{uid}`). Um
  // `pixKey` reintroduzido aqui seria o pior defeito possível deste redesenho
  // — o dinheiro iria pra chave errada.
  group(
    'OrganizerWalletRepository.requestWithdrawal manda so tournamentId e '
    'amountReais — nunca pixKey: o destino e sempre o perfil de quem pede, '
    'resolvido no servidor',
    () {
      test('payload tem exatamente as duas chaves esperadas', () async {
        final functions = _FakeFirebaseFunctions(responses: {
          'requestOrganizerWithdrawal': {
            'withdrawalId': 'w1',
            'status': 'pending',
          },
        });
        final repository =
            OrganizerWalletRepository(_UnusedFirestore(), functions: functions);

        await repository.requestWithdrawal(tournamentId: 't1', amountReais: 40);

        final payload = functions.calledPayloads.single;
        expect(payload?.keys.toSet(), {'tournamentId', 'amountReais'});
        expect(payload, {'tournamentId': 't1', 'amountReais': 40});
      });
    },
  );

  group('OrganizerWalletRepository.setPayoutPixKey', () {
    test(
      'devolve o ECO do servidor quando ele normaliza a chave (telefone ganha +55)',
      () async {
        final functions = _FakeFirebaseFunctions(responses: {
          'setOrganizerPayoutPixKey': {
            'success': true,
            'pixKey': '+5511999999999',
            'pixKeyType': 'PHONE',
          },
        });
        final repository =
            OrganizerWalletRepository(_UnusedFirestore(), functions: functions);

        final profile = await repository.setPayoutPixKey(
          pixKey: '11999999999',
          pixKeyType: 'PHONE',
        );

        expect(profile.pixKey, '+5511999999999');
        expect(profile.pixKeyType, 'PHONE');
        expect(profile.hasPixKey, isTrue);
      },
    );

    test(
      'sem eco do servidor (callable antiga), cai no valor ENVIADO — só quando o eco vem vazio',
      () async {
        final functions = _FakeFirebaseFunctions(responses: {
          'setOrganizerPayoutPixKey': {'success': true},
        });
        final repository =
            OrganizerWalletRepository(_UnusedFirestore(), functions: functions);

        final profile = await repository.setPayoutPixKey(
          pixKey: ' a@b.com ',
          pixKeyType: 'email',
        );

        expect(profile.pixKey, 'a@b.com');
        expect(profile.pixKeyType, 'EMAIL');
      },
    );
  });

  group('OrganizerWalletRepository.loadWalletView', () {
    test(
      'manda tournamentId e ledgerLimit quando informados — a callable trata '
      'ausente como "escolha o caixa mais cheio", então a chave não pode '
      'aparecer sozinha por engano',
      () async {
        final functions = _FakeFirebaseFunctions(responses: {
          'loadOrganizerWalletView': <String, dynamic>{},
        });
        final repository =
            OrganizerWalletRepository(_UnusedFirestore(), functions: functions);

        await repository.loadWalletView(tournamentId: 't1', ledgerLimit: 50);

        final payload = functions.calledPayloads.single;
        expect(payload?.keys.toSet(), {'tournamentId', 'ledgerLimit'});
        expect(payload, {'tournamentId': 't1', 'ledgerLimit': 50});
      },
    );

    test('omite tournamentId e ledgerLimit quando nulos', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'loadOrganizerWalletView': <String, dynamic>{},
      });
      final repository =
          OrganizerWalletRepository(_UnusedFirestore(), functions: functions);

      await repository.loadWalletView();

      expect(functions.calledPayloads.single, <String, dynamic>{});
    });
  });
}

/// Fake mínimo de [FirebaseFunctions]: registra o payload de toda callable
/// disparada e devolve a resposta configurada em [responses], sem rede real.
/// Mesmo padrão de `test/features/arenas/data/booking_service_coupon_test.dart`
/// e `test/features/organizer/organizer_category_ops_service_payment_test.dart`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result});

  final void Function(dynamic parameters) onCall;
  final Object? result;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(result);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `OrganizerWalletRepository` exige um `FirebaseFirestore`, mas os métodos
/// exercitados aqui (`requestWithdrawal`, `setPayoutPixKey`, `loadWalletView`)
/// só falam com `FirebaseFunctions` — nunca deve ser chamado nestes testes.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
