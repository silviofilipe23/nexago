/// Resposta da callable `getMyBenefits` (datas em ms), conforme a seção
/// "Versão premium (v2)" de `docs/product/vantagens-nexago-spec.md`. A leitura
/// é tolerante: campo faltando vira vazio, nunca um número inventado.
library;

/// Resposta do "Conseguiu usar?".
enum BenefitUseAnswer {
  used('used'),
  notUsed('not_used');

  const BenefitUseAnswer(this.key);

  final String key;

  static BenefitUseAnswer? fromKey(Object? raw) {
    for (final answer in values) {
      if (answer.key == raw) return answer;
    }
    return null;
  }
}

/// Um parceiro usado (clique no botão ou cupom copiado).
class BenefitUse {
  const BenefitUse({
    required this.partnerId,
    this.useCount = 0,
    this.firstUsedAt,
    this.lastUsedAt,
    this.lastAnswer,
    this.saved = false,
  });

  static BenefitUse? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['partnerId'];
    if (id is! String || id.trim().isEmpty) return null;
    final count = raw['useCount'];
    return BenefitUse(
      partnerId: id.trim(),
      useCount: count is num ? count.toInt() : 0,
      firstUsedAt: _millis(raw['firstUsedAt']),
      lastUsedAt: _millis(raw['lastUsedAt']),
      lastAnswer: BenefitUseAnswer.fromKey(raw['lastAnswer']),
      saved: raw['saved'] == true,
    );
  }

  final String partnerId;
  final int useCount;
  final DateTime? firstUsedAt;
  final DateTime? lastUsedAt;
  final BenefitUseAnswer? lastAnswer;
  final bool saved;
}

/// Economia confirmada pelos parceiros (só resgate `matched`).
class BenefitSavings {
  const BenefitSavings({
    this.confirmedCount = 0,
    this.totalDiscountCents = 0,
    this.byPartner = const {},
  });

  static const BenefitSavings none = BenefitSavings();

  factory BenefitSavings.fromMap(Object? raw) {
    if (raw is! Map) return none;
    final count = raw['confirmedCount'];
    final total = raw['totalDiscountCents'];
    final byPartner = <String, int>{};
    final rows = raw['byPartner'];
    if (rows is List) {
      for (final row in rows) {
        if (row is! Map) continue;
        final id = row['partnerId'];
        final cents = row['discountCents'];
        if (id is String && id.isNotEmpty && cents is num && cents > 0) {
          byPartner[id] = cents.toInt();
        }
      }
    }
    return BenefitSavings(
      confirmedCount: count is num && count > 0 ? count.toInt() : 0,
      totalDiscountCents: total is num && total > 0 ? total.toInt() : 0,
      byPartner: Map.unmodifiable(byPartner),
    );
  }

  final int confirmedCount;
  final int totalDiscountCents;

  /// Desconto confirmado por parceiro, em centavos.
  final Map<String, int> byPartner;

  /// A economia só aparece com resgate confirmado; sem isso a tela não mostra
  /// valor nenhum (nada de estimativa).
  bool get hasConfirmed => confirmedCount > 0 && totalDiscountCents > 0;
}

class MyBenefits {
  const MyBenefits({
    this.uses = const [],
    this.pendingQuestionPartnerId,
    this.savings = BenefitSavings.none,
    this.eligiblePartnerIds = const {},
  });

  static const MyBenefits empty = MyBenefits();

  factory MyBenefits.fromMap(Object? raw) {
    if (raw is! Map) return empty;
    final usesRaw = raw['uses'];
    final pending = raw['pendingQuestion'];
    final pendingId = pending is Map ? pending['partnerId'] : null;
    final eligible = raw['eligiblePartnerIds'];
    return MyBenefits(
      uses: usesRaw is List
          ? List.unmodifiable(
              usesRaw.map(BenefitUse.fromMap).whereType<BenefitUse>(),
            )
          : const [],
      pendingQuestionPartnerId: pendingId is String && pendingId.isNotEmpty
          ? pendingId
          : null,
      savings: BenefitSavings.fromMap(raw['savings']),
      eligiblePartnerIds: eligible is List
          ? Set.unmodifiable(eligible.whereType<String>())
          : const {},
    );
  }

  final List<BenefitUse> uses;

  /// Uso mais recente entre 2 h e 7 dias atrás, ainda sem resposta.
  final String? pendingQuestionPartnerId;
  final BenefitSavings savings;

  /// Parceiros com requisito que esta pessoa cumpre.
  final Set<String> eligiblePartnerIds;
}

DateTime? _millis(Object? value) =>
    value is num ? DateTime.fromMillisecondsSinceEpoch(value.toInt()) : null;
