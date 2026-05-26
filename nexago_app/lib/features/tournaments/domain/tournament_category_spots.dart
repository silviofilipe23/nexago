import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_discovery_models.dart';

enum CategorySpotsVisualStatus { available, almostFull, full }

/// ≥75% das vagas preenchidas → quase lotada (amarelo).
const double categorySpotsAlmostFullThreshold = 0.75;

/// Capacidade da categoria: `maxTeams` do Firestore, ou `spotsTotal` legado.
int categoryMaxTeams(TournamentCategoryOffer offer) {
  if (offer.maxTeams > 0) return offer.maxTeams;
  return offer.spotsTotal;
}

/// Inscritos na categoria.
///
/// Com [inscriptionCount] (de `artifacts/.../inscriptions`), usa a contagem real.
/// Sem isso, estima por `maxTeams - spotsLeft` no documento do torneio (legado).
int categoryEnrolledCount(
  TournamentCategoryOffer offer, {
  int? inscriptionCount,
}) {
  if (inscriptionCount != null) {
    final capacity = categoryMaxTeams(offer);
    if (capacity <= 0) return inscriptionCount.clamp(0, 999999);
    return inscriptionCount.clamp(0, capacity);
  }
  final capacity = categoryMaxTeams(offer);
  if (capacity <= 0) return 0;
  return (capacity - offer.spotsLeft).clamp(0, capacity);
}

/// Vagas/equipes restantes na categoria.
int categorySpotsLeft(
  TournamentCategoryOffer offer, {
  int? inscriptionCount,
}) {
  final capacity = categoryMaxTeams(offer);
  if (capacity <= 0) return offer.spotsLeft;
  if (inscriptionCount != null) {
    final enrolled = categoryEnrolledCount(
      offer,
      inscriptionCount: inscriptionCount,
    );
    return (capacity - enrolled).clamp(0, capacity);
  }
  return offer.spotsLeft.clamp(0, capacity);
}

CategorySpotsVisualStatus categorySpotsVisualStatus({
  required int spotsLeft,
  required int spotsTotal,
}) {
  if (spotsTotal <= 0) return CategorySpotsVisualStatus.available;
  if (spotsLeft <= 0) return CategorySpotsVisualStatus.full;
  final filled = (spotsTotal - spotsLeft) / spotsTotal;
  if (filled >= categorySpotsAlmostFullThreshold) {
    return CategorySpotsVisualStatus.almostFull;
  }
  return CategorySpotsVisualStatus.available;
}

Color categorySpotsStatusColor(CategorySpotsVisualStatus status) {
  return switch (status) {
    CategorySpotsVisualStatus.available => AppColors.win,
    CategorySpotsVisualStatus.almostFull => AppColors.pending,
    CategorySpotsVisualStatus.full => AppColors.live,
  };
}

String categorySpotsRightLabel({
  required int spotsLeft,
  required CategorySpotsVisualStatus status,
}) {
  if (status == CategorySpotsVisualStatus.full) return 'LOTADA';
  if (spotsLeft == 1) return '1 livre';
  return '$spotsLeft livres';
}

int categorySpotsEnrolledCount(int spotsLeft, int spotsTotal) {
  if (spotsTotal <= 0) return 0;
  return (spotsTotal - spotsLeft).clamp(0, spotsTotal);
}

/// Rótulo curto para a coluna esquerda (Masc, Fem, Misto…).
String categoryOfferDisplayName(TournamentCategoryOffer offer) {
  final n = offer.name.toLowerCase();
  if (n.contains('masc') || n == 'm') return 'Masc';
  if (n.contains('fem') || n == 'f') return 'Fem';
  if (n.contains('misto') || n.contains('mix')) return 'Misto';
  if (offer.name.length <= 12) return offer.name;
  return offer.name.split(' ').first;
}
