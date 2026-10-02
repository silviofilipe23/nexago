import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_rules.dart';
import '../infrastructure/firestore_cashback_repository.dart';

export '../infrastructure/firestore_cashback_repository.dart'
    show cashbackRepositoryProvider;

// Sem TTL de cache de propósito: a home fica montada no shell e a pílula já
// mantém config e carteira vivas enquanto o atleta usa o app (e o `Timer` de
// um TTL ficaria pendente nos testes com `UncontrolledProviderScope`).

/// Uid da sessão; vazio deslogado (os streams viram valores neutros e nenhuma
/// leitura bate nas rules).
final cashbackUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `appConfig/cashback` (a rule exige sessão).
final cashbackConfigProvider =
    StreamProvider.autoDispose<CashbackConfig>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(CashbackConfig.fallback);
  return ref.watch(cashbackRepositoryProvider).watchConfig();
});

final cashbackWalletProvider =
    StreamProvider.autoDispose<CashbackWallet>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(CashbackWallet.empty);
  return ref.watch(cashbackRepositoryProvider).watchWallet(uid);
});

final cashbackLedgerProvider =
    StreamProvider.autoDispose<List<CashbackLedgerEntry>>((ref) {
  final uid = ref.watch(cashbackUidProvider);
  if (uid.isEmpty) return Stream.value(const <CashbackLedgerEntry>[]);
  return ref.watch(cashbackRepositoryProvider).watchLedger(uid);
});

/// Lote de um pagamento (`lots/{asaasPaymentId}`), ao vivo.
final cashbackLotProvider =
    StreamProvider.autoDispose.family<CashbackLot?, String>((ref, lotId) {
  final uid = ref.watch(cashbackUidProvider);
  final id = lotId.trim();
  if (uid.isEmpty || id.isEmpty) return Stream<CashbackLot?>.value(null);
  return ref.watch(cashbackRepositoryProvider).watchLot(uid, id);
});

/// Valor da pílula da home; `null` = escondida (desligado, sem saldo ou
/// carregando).
final cashbackPillCentsProvider = Provider.autoDispose<int?>((ref) {
  return cashbackPillCents(
    config: ref.watch(cashbackConfigProvider).valueOrNull,
    wallet: ref.watch(cashbackWalletProvider).valueOrNull,
  );
});

/// O que os checkouts precisam; `null` enquanto carrega ou com erro (aí o
/// toggle não aparece e a cobrança sai como sempre).
final cashbackCheckoutContextProvider =
    Provider.autoDispose<CashbackCheckoutContext?>((ref) {
  final config = ref.watch(cashbackConfigProvider).valueOrNull;
  final wallet = ref.watch(cashbackWalletProvider).valueOrNull;
  if (config == null || wallet == null) return null;
  return CashbackCheckoutContext(
    config: config,
    availableCents: wallet.availableCents,
  );
});

/// O recurso está ligado? Carregando ou com erro conta como desligado.
final cashbackEnabledProvider = Provider.autoDispose<bool>((ref) {
  return ref.watch(cashbackConfigProvider).valueOrNull?.enabled ?? false;
});
