import 'tournament_detail_logic.dart';
import 'tournament_detail_model.dart';
import 'tournament_discovery_models.dart';
import 'tournament_registration_logic.dart';

/// Badge da categoria no convite (ex.: `Masculino Intermediário`).
String partnerInviteCategoryBadge(TournamentCategoryOffer offer) {
  final gender = categoryGenderDisplayLabel(offer);
  final level = offer.level.trim();
  if (level.isNotEmpty) return '$gender $level';
  final name = offer.name.trim();
  if (name.isNotEmpty) return name;
  return gender.isNotEmpty ? gender : 'Categoria';
}

/// Valor total em disputa na categoria.
String partnerInvitePrizeLabel(TournamentCategoryOffer? offer) {
  if (offer == null) return 'Premiação a confirmar';
  final total = tournamentCategoryPrizesTotal(offer);
  if (total <= 0) return 'Premiação a confirmar';
  return formatMoney(total);
}

/// Parcela de inscrição por atleta na dupla.
String partnerInviteShareFeeLabel(TournamentCategoryOffer? offer) {
  if (offer == null) return r'R$ —';
  final quote = buildRegistrationQuote(
    entryFee: offer.entryFee,
    teamSize: offer.rosterSize,
  );
  if (quote.shareAmount <= 0) return 'Grátis';
  return formatRegistrationMoney(quote.shareAmount);
}

/// Data compacta do torneio (ex.: `sáb · 20 jun`).
String partnerInviteCompactDate(TournamentDetail detail) {
  return tournamentDetailCompactDate(detail).replaceAll(' • ', ' · ');
}
