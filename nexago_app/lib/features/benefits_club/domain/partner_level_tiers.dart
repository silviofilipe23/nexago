/// Desconto por elo do SandRanking (`partners/{partnerId}.levelTiers`),
/// conforme a seção "Desconto por elo do SandRanking" de
/// `docs/product/vantagens-nexago-spec.md`. Espelha
/// `functions/src/benefits-club-level-tiers.ts`.
///
/// O benefício-base do parceiro vale abaixo da primeira faixa (Iniciante e
/// quem não tem elo); o atleta fica com a faixa mais alta que o elo alcança.
/// O cupom da faixa não está no doc público: sai da `claimBenefit`.
library;

import '../../athlete/domain/sand_rank/sand_rank_catalog.dart';

/// Elos na ordem da escada (Iniciante → Lenda).
final List<String> sandRankCodes = List.unmodifiable(
  sandRankTrack.map((step) => step.rankCode).toSet(),
);

/// O primeiro elo é o do benefício-base: faixa só a partir do segundo.
final List<String> partnerLevelTierRanks = List.unmodifiable(
  sandRankCodes.skip(1),
);

const int _maxTierHighlightLength = 24;
const int _maxTierTitleLength = 80;

/// Uma faixa: "a partir do elo [minRank]", com o selo e o título dela.
class PartnerLevelTier {
  const PartnerLevelTier({
    required this.minRank,
    required this.benefitHighlight,
    required this.benefitTitle,
  });

  final String minRank;
  final String benefitHighlight;
  final String benefitTitle;
}

/// A escada já resolvida para o atleta: a primeira linha é o benefício-base
/// (com `minRank` do primeiro elo), as outras são as faixas, e
/// [currentRank] é a linha que vale para ele.
class PartnerLevelLadder {
  const PartnerLevelLadder({required this.rungs, required this.currentRank});

  final List<PartnerLevelTier> rungs;
  final String currentRank;
}

/// Lê `levelTiers` como o servidor (`parseLevelTiers`): só faixas
/// bem-formadas, uma por elo, em ordem crescente. Item malformado é ignorado.
List<PartnerLevelTier> readPartnerLevelTiers(Object? raw) {
  if (raw is! List) return const [];
  final byRank = <String, PartnerLevelTier>{};
  for (final item in raw) {
    final tier = _tierFromMap(item);
    if (tier == null || byRank.containsKey(tier.minRank)) continue;
    byRank[tier.minRank] = tier;
  }
  final sorted = byRank.values.toList()
    ..sort((a, b) => _rankOrder(a.minRank).compareTo(_rankOrder(b.minRank)));
  return List.unmodifiable(sorted);
}

PartnerLevelTier? _tierFromMap(Object? item) {
  if (item is! Map) return null;
  final minRank = item['minRank'];
  final highlight = item['benefitHighlight'];
  final title = item['benefitTitle'];
  if (minRank is! String || !partnerLevelTierRanks.contains(minRank)) {
    return null;
  }
  if (highlight is! String || highlight.length > _maxTierHighlightLength) {
    return null;
  }
  if (title is! String ||
      title.trim().isEmpty ||
      title.length > _maxTierTitleLength) {
    return null;
  }
  return PartnerLevelTier(
    minRank: minRank,
    benefitHighlight: highlight.trim(),
    benefitTitle: title.trim(),
  );
}

int _rankOrder(String rankCode) => sandRankCodes.indexOf(rankCode);

/// Elo pelo degrau do espelho `users/{uid}.sandRank.trackIndex`; sem degrau
/// (ou fora da trilha) é o primeiro elo.
String sandRankCodeForTrackIndex(int? trackIndex) {
  final step = trackIndex == null ? null : sandRankStepByTrackIndex(trackIndex);
  return step?.rankCode ?? sandRankCodes.first;
}

/// A faixa mais alta que o elo alcança; `null` = benefício-base.
PartnerLevelTier? levelTierFor(List<PartnerLevelTier> tiers, String rankCode) {
  final rank = _rankOrder(rankCode);
  PartnerLevelTier? best;
  for (final tier in tiers) {
    if (_rankOrder(tier.minRank) <= rank) best = tier;
  }
  return best;
}
