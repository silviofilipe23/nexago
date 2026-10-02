// Modelos do cashback do atleta — espelho do backend (`functions/src/
// cashback-config.ts`, `athlete-wallet-state.ts`). Dinheiro sempre em
// CENTAVOS inteiros, como no Firestore. Nenhum tipo do Firebase aqui: o
// `Timestamp` vira `DateTime` na infraestrutura.

/// Configuração ao vivo do cashback (`appConfig/cashback`).
///
/// Mesma normalização de `parseCashbackConfig`: doc ausente ou campo inválido
/// cai no padrão, e o padrão é DESLIGADO.
class CashbackConfig {
  const CashbackConfig({
    required this.enabled,
    required this.ratePercent,
    required this.maxShareOfFee,
    required this.minCashCents,
    required this.expiryMonths,
    required this.expiryWarningDays,
  });

  /// Doc ausente ou ilegível: desligado, com os valores padrão do backend.
  static const CashbackConfig fallback = CashbackConfig(
    enabled: false,
    ratePercent: 2,
    maxShareOfFee: 0.5,
    minCashCents: 500,
    expiryMonths: 6,
    expiryWarningDays: 15,
  );

  factory CashbackConfig.fromMap(Map<String, dynamic>? raw) {
    const d = fallback;
    if (raw == null) return d;
    final minCashReais =
        _numberInRange(raw['minCashReais'], 0, 1000, d.minCashCents / 100);
    return CashbackConfig(
      enabled: raw['enabled'] == true,
      ratePercent: _numberInRange(raw['ratePercent'], 0, 20, d.ratePercent),
      maxShareOfFee:
          _numberInRange(raw['maxShareOfFee'], 0, 1, d.maxShareOfFee),
      minCashCents: (minCashReais * 100).round(),
      expiryMonths: _numberInRange(
        raw['expiryMonths'],
        1,
        60,
        d.expiryMonths.toDouble(),
      ).round(),
      expiryWarningDays: _numberInRange(
        raw['expiryWarningDays'],
        0,
        90,
        d.expiryWarningDays.toDouble(),
      ).round(),
    );
  }

  final bool enabled;

  /// % sobre o dinheiro pago ("Ganhe até X% de volta").
  final double ratePercent;

  /// Teto do ganho como fração da taxa da nexaGO (só o servidor usa).
  final double maxShareOfFee;

  /// Mínimo que sempre vai no PIX quando o atleta usa saldo.
  final int minCashCents;

  /// Validade de cada crédito depois de liberado.
  final int expiryMonths;

  /// Antecedência do aviso de vencimento (push do servidor).
  final int expiryWarningDays;
}

double _numberInRange(Object? raw, num min, num max, double fallback) {
  if (raw is num && raw.isFinite && raw >= min && raw <= max) {
    return raw.toDouble();
  }
  return fallback;
}

/// `athleteWallets/{uid}` — doc ausente = carteira zerada.
class CashbackWallet {
  const CashbackWallet({
    this.availableCents = 0,
    this.pendingCents = 0,
    this.heldCents = 0,
    this.lifetimeEarnedCents = 0,
    this.lifetimeRedeemedCents = 0,
    this.nextExpiryAt,
    this.nextExpiryCents = 0,
  });

  static const CashbackWallet empty = CashbackWallet();

  /// Pronto para usar no próximo pagamento.
  final int availableCents;

  /// Ganho esperando o jogo acontecer.
  final int pendingCents;

  /// Preso numa cobrança aberta (volta se ela expirar).
  final int heldCents;
  final int lifetimeEarnedCents;
  final int lifetimeRedeemedCents;

  /// Vencimento mais próximo entre os créditos disponíveis.
  final DateTime? nextExpiryAt;
  final int nextExpiryCents;

  /// O que a pílula da home mostra: disponível + pendente.
  int get balanceCents => availableCents + pendingCents;
}

/// Estado de um lote (`athleteWallets/{uid}/lots/{asaasPaymentId}`).
enum CashbackLotStatus {
  pending,
  available,
  consumed,
  expired,
  cancelled,
  reversed,
  unknown;

  static CashbackLotStatus from(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    for (final status in values) {
      if (status != unknown && status.name == value) return status;
    }
    return unknown;
  }
}

/// Um crédito de cashback — o id é o id do pagamento no Asaas.
class CashbackLot {
  const CashbackLot({
    required this.id,
    required this.status,
    required this.earnedCents,
    required this.remainingCents,
    this.label = '',
    this.eventAt,
    this.expiresAt,
  });

  final String id;
  final CashbackLotStatus status;
  final int earnedCents;
  final int remainingCents;
  final String label;
  final DateTime? eventAt;
  final DateTime? expiresAt;

  /// Ganho deste pagamento ainda esperando o jogo — o que a tela de sucesso
  /// anuncia. Lote cancelado/estornado não é anunciado.
  bool get isPendingEarn =>
      status == CashbackLotStatus.pending && earnedCents > 0;
}

/// Tipo de lançamento do extrato (`athleteWallets/{uid}/ledger`).
enum CashbackLedgerType {
  earn,
  release,
  cancel,
  redeem,
  expire,
  reverse,
  refund,
  unknown;

  static CashbackLedgerType from(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    for (final type in values) {
      if (type != unknown && type.name == value) return type;
    }
    return unknown;
  }
}

/// Tom visual da linha do extrato; a cor concreta fica na apresentação.
enum CashbackLedgerTone { pending, positive, brand, muted }

/// Linha do extrato. `amountCents` é sempre positivo — o sinal vem do tipo.
class CashbackLedgerEntry {
  const CashbackLedgerEntry({
    required this.id,
    required this.type,
    required this.amountCents,
    this.label = '',
    this.createdAt,
  });

  final String id;
  final CashbackLedgerType type;
  final int amountCents;

  /// Pronto do servidor para o extrato ("Reserva · Arena Sol · 12/10").
  final String label;
  final DateTime? createdAt;

  String get title => switch (type) {
        CashbackLedgerType.earn => 'Cashback ganho',
        CashbackLedgerType.release => 'Cashback liberado',
        CashbackLedgerType.cancel => 'Cashback cancelado',
        CashbackLedgerType.redeem => 'Usado no pagamento',
        CashbackLedgerType.expire => 'Venceu',
        CashbackLedgerType.reverse => 'Estornado',
        CashbackLedgerType.refund => 'Devolvido ao saldo',
        CashbackLedgerType.unknown => 'Movimento',
      };

  /// Entra no saldo (+) ou sai (−).
  bool get isCredit => switch (type) {
        CashbackLedgerType.earn ||
        CashbackLedgerType.release ||
        CashbackLedgerType.refund =>
          true,
        _ => false,
      };

  CashbackLedgerTone get tone => switch (type) {
        CashbackLedgerType.earn => CashbackLedgerTone.pending,
        CashbackLedgerType.release ||
        CashbackLedgerType.refund =>
          CashbackLedgerTone.positive,
        CashbackLedgerType.redeem => CashbackLedgerTone.brand,
        _ => CashbackLedgerTone.muted,
      };
}
