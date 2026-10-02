import 'cashback_models.dart';

/// Leitura da carteira de cashback do atleta. Escrita é só do servidor (as
/// rules negam qualquer escrita do cliente).
abstract interface class CashbackRepository {
  /// `appConfig/cashback`, já normalizado.
  Stream<CashbackConfig> watchConfig();

  /// `athleteWallets/{uid}` — doc ausente emite a carteira zerada.
  Stream<CashbackWallet> watchWallet(String uid);

  /// Últimos lançamentos do extrato, do mais recente para o mais antigo.
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid);

  /// `lots/{lotId}` — `null` enquanto o lote não existe.
  Stream<CashbackLot?> watchLot(String uid, String lotId);
}
