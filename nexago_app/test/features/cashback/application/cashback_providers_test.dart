import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/domain/cashback_repository.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

/// Repositório dublê: registra cada leitura (`calls`) e devolve o que o teste
/// encenou. Deslogado, nenhuma leitura pode acontecer.
class _FakeCashbackRepository implements CashbackRepository {
  _FakeCashbackRepository({
    this.config = CashbackConfig.fallback,
    this.wallet = CashbackWallet.empty,
    this.ledger = const [],
    this.lot,
  });

  final CashbackConfig config;
  final CashbackWallet wallet;
  final List<CashbackLedgerEntry> ledger;
  final CashbackLot? lot;
  final calls = <String>[];

  @override
  Stream<CashbackConfig> watchConfig() {
    calls.add('config');
    return Stream.value(config);
  }

  @override
  Stream<CashbackWallet> watchWallet(String uid) {
    calls.add('wallet:$uid');
    return Stream.value(wallet);
  }

  @override
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid) {
    calls.add('ledger:$uid');
    return Stream.value(ledger);
  }

  @override
  Stream<CashbackLot?> watchLot(String uid, String lotId) {
    calls.add('lot:$uid/$lotId');
    return Stream.value(lot);
  }
}

ProviderContainer _container({
  required String uid,
  required CashbackRepository repo,
}) {
  final container = ProviderContainer(
    overrides: [
      cashbackUidProvider.overrideWith((ref) => uid),
      cashbackRepositoryProvider.overrideWithValue(repo),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Mantém o provider `autoDispose` vivo e espera o primeiro valor.
Future<T> _valueOf<T>(
  ProviderContainer container,
  AutoDisposeStreamProvider<T> provider,
) {
  container.listen(provider, (_, _) {});
  return container.read(provider.future);
}

void main() {
  test('logado: config, carteira, extrato e lote vêm do repositório do uid',
      () async {
    final repo = _FakeCashbackRepository(
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000),
      ledger: const [
        CashbackLedgerEntry(
          id: 'e1',
          type: CashbackLedgerType.earn,
          amountCents: 240,
        ),
      ],
      lot: const CashbackLot(
        id: 'pay_1',
        status: CashbackLotStatus.pending,
        earnedCents: 240,
        remainingCents: 240,
      ),
    );
    final container = _container(uid: 'u1', repo: repo);

    expect((await _valueOf(container, cashbackConfigProvider)).enabled, isTrue);
    expect(
      (await _valueOf(container, cashbackWalletProvider)).availableCents,
      1000,
    );
    expect((await _valueOf(container, cashbackLedgerProvider)).single.id, 'e1');
    expect(
      (await _valueOf(container, cashbackLotProvider('pay_1')))?.earnedCents,
      240,
    );
    expect(
      repo.calls,
      containsAll(<String>['config', 'wallet:u1', 'ledger:u1', 'lot:u1/pay_1']),
    );
  });

  test('deslogado: valores neutros sem tocar no repositório', () async {
    final repo = _FakeCashbackRepository(
      config: ligado,
      wallet: const CashbackWallet(availableCents: 1000),
    );
    final container = _container(uid: '', repo: repo);

    expect(
      (await _valueOf(container, cashbackConfigProvider)).enabled,
      isFalse,
    );
    expect(
      (await _valueOf(container, cashbackWalletProvider)).availableCents,
      0,
    );
    expect(await _valueOf(container, cashbackLedgerProvider), isEmpty);
    expect(await _valueOf(container, cashbackLotProvider('pay_1')), isNull);
    expect(repo.calls, isEmpty);
  });

  test('lote sem id não lê nada', () async {
    final repo = _FakeCashbackRepository();
    final container = _container(uid: 'u1', repo: repo);

    expect(await _valueOf(container, cashbackLotProvider(' ')), isNull);
    expect(repo.calls.where((c) => c.startsWith('lot:')), isEmpty);
  });

  test('pílula: ligado com saldo mostra disponível + pendente', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        config: ligado,
        wallet: const CashbackWallet(availableCents: 1000, pendingCents: 240),
      ),
    );
    container.listen(cashbackPillCentsProvider, (_, _) {});
    container.listen(cashbackEnabledProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    expect(container.read(cashbackPillCentsProvider), 1240);
    expect(container.read(cashbackEnabledProvider), isTrue);
  });

  test('pílula: desligado esconde mesmo com saldo antigo', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        wallet: const CashbackWallet(availableCents: 1000),
      ),
    );
    container.listen(cashbackPillCentsProvider, (_, _) {});
    container.listen(cashbackEnabledProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    expect(container.read(cashbackPillCentsProvider), isNull);
    expect(container.read(cashbackEnabledProvider), isFalse);
  });

  test('checkout: contexto com a config e o disponível', () async {
    final container = _container(
      uid: 'u1',
      repo: _FakeCashbackRepository(
        config: ligado,
        wallet: const CashbackWallet(availableCents: 1000, pendingCents: 999),
      ),
    );
    container.listen(cashbackCheckoutContextProvider, (_, _) {});
    await _valueOf(container, cashbackConfigProvider);
    await _valueOf(container, cashbackWalletProvider);

    final checkout = container.read(cashbackCheckoutContextProvider);
    expect(checkout, isNotNull);
    expect(checkout!.availableCents, 1000);
    expect(checkout.config.enabled, isTrue);
  });
}
