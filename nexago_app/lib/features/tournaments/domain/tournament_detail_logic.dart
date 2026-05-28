import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import 'tournament_detail_model.dart';
import 'tournament_category_spots.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';

class TournamentDetailStats {
  const TournamentDetailStats({
    required this.categoryCount,
    required this.openCategories,
    required this.spotsTotal,
    required this.spotsEnrolled,
    required this.prizeTotalLabel,
  });

  final int categoryCount;
  final int openCategories;
  final int spotsTotal;
  final int spotsEnrolled;
  final String prizeTotalLabel;
}

class TournamentCategoryRowStatus {
  const TournamentCategoryRowStatus({
    required this.label,
    required this.color,
    required this.isClosed,
  });

  final String label;
  final Color color;
  final bool isClosed;
}

final _longDateFmt = DateFormat("d 'de' MMMM 'de' y", 'pt_BR');
final _currencyFmt = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$');

const _defaultAboutText =
    'Informações completas do evento serão publicadas pela organização em breve.';

/// Rótulo `TORNEIO · 1 ETAPA`.
String tournamentStageEyebrow(TournamentDetail detail) {
  final order = detail.leagueStageOrder ?? 1;
  if (detail.leagueStageName != null && detail.leagueStageName!.isNotEmpty) {
    return 'TORNEIO · ${detail.leagueStageName!.toUpperCase()}';
  }
  return 'TORNEIO · $order ETAPA';
}

String tournamentDetailLongDate(TournamentDetail detail) {
  final start = detail.startDate;
  final end = detail.endDate;
  if (end != null &&
      (end.year != start.year ||
          end.month != start.month ||
          end.day != start.day)) {
    return '${_longDateFmt.format(start)} – ${_longDateFmt.format(end)}';
  }
  return _longDateFmt.format(start);
}

String tournamentDetailAboutText(TournamentDetail detail) {
  final t = detail.regulationsText?.trim();
  if (t != null && t.isNotEmpty) return t;
  return _defaultAboutText;
}

String tournamentDetailFormatSummary(TournamentDetail detail) {
  final formats = detail.categoryOffers
      .map((o) => bracketFormatLabel(o.bracketFormat))
      .where((s) => s.isNotEmpty)
      .toSet()
      .toList();
  if (formats.isEmpty) return 'A confirmar';
  if (formats.length == 1) return formats.first;
  return formats.first;
}

String tournamentDetailLocationSummary(TournamentDetail detail) {
  return detail.location;
}

String tournamentDetailEntrySummary(TournamentDetail detail) {
  if (detail.priceValue <= 0) return 'A confirmar';
  return 'A partir de ${detail.priceLabel}';
}

TournamentDetailStats tournamentDetailStats(
  TournamentDetail detail, {
  Map<String, int>? enrollmentByCategoryId,
}) {
  final offers = detail.categoryOffers;
  if (offers.isEmpty) {
    final total = detail.spotsTotal;
    final enrolled = (total - detail.spotsLeft).clamp(0, total);
    return TournamentDetailStats(
      categoryCount: 0,
      openCategories: 0,
      spotsTotal: total,
      spotsEnrolled: enrolled > 0 ? enrolled : detail.enrolledCount,
      prizeTotalLabel: _prizeTotalLabel(detail),
    );
  }

  var spotsTotal = 0;
  var spotsEnrolled = 0;
  var openCategories = 0;
  for (final o in offers) {
    final total = categoryMaxTeams(o);
    spotsTotal += total;
    if (total > 0) {
      spotsEnrolled += categoryEnrolledCount(
        o,
        inscriptionCount: enrollmentByCategoryId?[o.id],
      );
    }
    if (!o.registrationClosed && !o.isCompleted) openCategories++;
  }

  return TournamentDetailStats(
    categoryCount: offers.length,
    openCategories: openCategories,
    spotsTotal: spotsTotal > 0 ? spotsTotal : detail.spotsTotal,
    spotsEnrolled: spotsEnrolled > 0 ? spotsEnrolled : detail.enrolledCount,
    prizeTotalLabel: _prizeTotalLabel(detail),
  );
}

String _prizeTotalLabel(TournamentDetail detail) {
  var total = 0.0;
  for (final p in detail.tournamentPrizes) {
    total += p.value;
  }
  for (final o in detail.categoryOffers) {
    for (final p in o.prizes) {
      total += p.value;
    }
  }
  if (total <= 0) return '—';
  return _currencyFmt.format(total);
}

double _prizeTotalValue(TournamentDetail detail) {
  var total = 0.0;
  for (final p in detail.tournamentPrizes) {
    total += p.value;
  }
  for (final o in detail.categoryOffers) {
    for (final p in o.prizes) {
      total += p.value;
    }
  }
  return total;
}

TournamentCategoryRowStatus tournamentCategoryRowStatus(
  TournamentCategoryOffer offer, {
  int? inscriptionCount,
}) {
  if (offer.registrationClosed || offer.isCompleted) {
    return const TournamentCategoryRowStatus(
      label: 'ENCERRADA',
      color: AppColors.live,
      isClosed: true,
    );
  }
  if (categoryMaxTeams(offer) > 0 &&
      categorySpotsLeft(offer, inscriptionCount: inscriptionCount) <= 0) {
    return const TournamentCategoryRowStatus(
      label: 'LOTADA',
      color: AppColors.live,
      isClosed: true,
    );
  }
  final left = categorySpotsLeft(offer, inscriptionCount: inscriptionCount);
  if (left == 1) {
    return const TournamentCategoryRowStatus(
      label: '1 vaga',
      color: AppColors.win,
      isClosed: false,
    );
  }
  return TournamentCategoryRowStatus(
    label: '$left vagas',
    color: AppColors.win,
    isClosed: false,
  );
}

String bracketFormatLabel(String raw) {
  final n = raw.trim().toLowerCase();
  if (n.isEmpty) return '';
  return switch (n) {
    'single elimination' => 'Eliminatória simples',
    'double elimination' => 'Dupla eliminatória',
    'pool play + se' => 'Fase de Grupos + Mata-mata',
    'group cross + play-in' => 'Grupos cruzados + Mata-mata',
    _ when n.contains('pool') && n.contains('se') =>
      'Fase de Grupos + Mata-mata',
    _ when n.contains('grupos') => 'Fase de Grupos + Mata-mata',
    _ => raw,
  };
}

String tournamentCategorySubtitle(TournamentCategoryOffer offer) {
  final fee = offer.entryFee;
  final feeLabel = fee > 0
      ? 'R\$ ${fee.toStringAsFixed(fee.truncateToDouble() == fee ? 0 : 2)}'
      : 'Grátis';
  final format = bracketFormatLabel(offer.bracketFormat);
  if (format.isEmpty) return feeLabel;
  return '$feeLabel · $format';
}

String tournamentOrganizerDisplayName({String? profileName, String? email}) {
  final name = profileName?.trim();
  if (name != null && name.isNotEmpty) return name;
  final mail = email?.trim();
  if (mail != null && mail.isNotEmpty) return mail;
  return 'A confirmar';
}

/// Expõe valor numérico do prêmio para testes.
double tournamentPrizeTotalValue(TournamentDetail detail) =>
    _prizeTotalValue(detail);

/// Valor numérico do prêmio total do torneio em disputa (torneio + categorias).
///
/// Mantido como alias semântico para uso na tela de premiação.
double tournamentEventPrizesTotalValue(TournamentDetail detail) =>
    tournamentPrizeTotalValue(detail);

/// Soma de prêmios de uma categoria.
double tournamentCategoryPrizesTotal(TournamentCategoryOffer offer) {
  double total = 0;
  for (final p in offer.prizes) {
    total += p.value;
  }
  return total;
}

/// Soma de prêmios de todas as categorias (somente categorias com `prizes`).
double tournamentCategoryPrizesTotalAll(List<TournamentCategoryOffer> offers) {
  double total = 0;
  for (final o in offers) {
    total += tournamentCategoryPrizesTotal(o);
  }
  return total;
}

/// Quantidade de categorias que possuem `prizes` configurados.
int tournamentCategoryPrizesCategoriesCount(
  List<TournamentCategoryOffer> offers,
) {
  var count = 0;
  for (final o in offers) {
    if (o.prizes.isNotEmpty) count++;
  }
  return count;
}

String formatMoney(double value) {
  final v = value <= 0 ? 0 : value;
  return _currencyFmt.format(v);
}

/// Subtítulo da categoria na aba de premiação (ex.: `Masculino · Fase de Grupos + SE`).
String tournamentCategoryPrizeSubtitle(TournamentCategoryOffer offer) {
  final parts = <String>[];
  final gender = offer.genderType.trim();
  if (gender.isNotEmpty) {
    parts.add(_titleCaseWords(gender));
  } else {
    final tag = tournamentCategoryGenderTag(offer);
    if (tag != 'ABERTO') {
      parts.add(_titleCaseWords(tag));
    }
  }
  final format = bracketFormatLabel(offer.bracketFormat);
  if (format.isNotEmpty) parts.add(format);
  return parts.join(' · ');
}

double tournamentCategoryFirstPlaceValue(TournamentCategoryOffer offer) {
  for (final p in offer.prizes) {
    if (_prizeOrder(p.position) == 1) return p.value;
  }
  return 0;
}

/// Soma dos prêmios de 1º lugar de todas as categorias.
double tournamentCategoryFirstPlaceTotalAll(
  List<TournamentCategoryOffer> offers,
) {
  double total = 0;
  for (final o in offers) {
    total += tournamentCategoryFirstPlaceValue(o);
  }
  return total;
}

String _titleCaseWords(String raw) {
  final words = raw.trim().split(' ').where((w) => w.isNotEmpty);
  return words
      .map((w) {
        final lower = w.toLowerCase();
        if (lower.isEmpty) return lower;
        return lower[0].toUpperCase() + lower.substring(1);
      })
      .join(' ');
}

enum TournamentCategoryCtaKind {
  register,
  waitlist,
  disabled,
  viewRegistration,
}

class TournamentCategoryVacancyUi {
  const TournamentCategoryVacancyUi({
    required this.enrolled,
    required this.total,
    required this.fill,
    required this.barColor,
    required this.caption,
    required this.captionColor,
  });

  final int enrolled;
  final int total;
  final double fill;
  final Color barColor;
  final String caption;
  final Color captionColor;
}

class CategoryPrizeRow {
  const CategoryPrizeRow({
    required this.positionLabel,
    required this.amountLabel,
    required this.highlight,
  });

  final String positionLabel;
  final String amountLabel;
  final bool highlight;
}

String tournamentCategoryGenderTag(TournamentCategoryOffer offer) {
  final g = offer.genderType.trim();
  if (g.isNotEmpty) {
    final lower = g.toLowerCase();
    if (lower.contains('masc')) return 'MASCULINO';
    if (lower.contains('fem')) return 'FEMININO';
    if (lower.contains('misto') || lower.contains('mix')) return 'MISTO';
    return g.toUpperCase();
  }
  final n = offer.name.toLowerCase();
  if (n.contains('masc')) return 'MASCULINO';
  if (n.contains('fem')) return 'FEMININO';
  if (n.contains('misto')) return 'MISTO';
  return 'ABERTO';
}

String tournamentCategoryFormatTag(TournamentCategoryOffer offer) {
  final label = bracketFormatLabel(offer.bracketFormat);
  return label.isEmpty ? 'FORMATO A CONFIRMAR' : label.toUpperCase();
}

TournamentCategoryVacancyUi tournamentCategoryVacancyUi(
  TournamentCategoryOffer offer, {
  int? inscriptionCount,
}) {
  final total = categoryMaxTeams(offer);
  final enrolled = categoryEnrolledCount(
    offer,
    inscriptionCount: inscriptionCount,
  );
  final spotsLeft = categorySpotsLeft(
    offer,
    inscriptionCount: inscriptionCount,
  );
  final fill = total > 0 ? (enrolled / total).clamp(0.0, 1.0) : 0.0;
  final closed =
      offer.registrationClosed ||
      offer.isCompleted ||
      (total > 0 && spotsLeft <= 0);

  if (closed && total > 0 && enrolled >= total) {
    return TournamentCategoryVacancyUi(
      enrolled: enrolled,
      total: total,
      fill: 1,
      barColor: AppColors.live,
      caption: 'Categoria encerrada — todas as vagas preenchidas',
      captionColor: AppColors.live,
    );
  }

  if (spotsLeft <= 0 && total > 0) {
    return TournamentCategoryVacancyUi(
      enrolled: enrolled,
      total: total,
      fill: 1,
      barColor: AppColors.live,
      caption: 'Categoria lotada',
      captionColor: AppColors.live,
    );
  }

  final left = spotsLeft;
  return TournamentCategoryVacancyUi(
    enrolled: enrolled,
    total: total,
    fill: fill,
    barColor: fill >= 0.75 ? AppColors.pending : AppColors.win,
    caption: left == 1 ? '1 vaga disponível' : '$left vagas disponíveis',
    captionColor: fill >= 0.75 ? AppColors.pending : AppColors.win,
  );
}

TournamentCategoryCtaKind tournamentCategoryCtaKind(
  TournamentCategoryOffer offer,
  TournamentListingStatus tournamentStatus, {
  int? inscriptionCount,
}) {
  if (offer.registrationClosed || offer.isCompleted) {
    return TournamentCategoryCtaKind.waitlist;
  }
  if (categoryMaxTeams(offer) > 0 &&
      categorySpotsLeft(offer, inscriptionCount: inscriptionCount) <= 0) {
    return TournamentCategoryCtaKind.waitlist;
  }
  if (canRegisterForTournament(tournamentStatus)) {
    return TournamentCategoryCtaKind.register;
  }
  return TournamentCategoryCtaKind.disabled;
}

String tournamentCategoryCtaLabel(TournamentCategoryCtaKind kind) {
  return switch (kind) {
    TournamentCategoryCtaKind.register => 'Inscrever-se →',
    TournamentCategoryCtaKind.waitlist => 'Lista de espera',
    TournamentCategoryCtaKind.disabled => 'Inscrições fechadas',
    TournamentCategoryCtaKind.viewRegistration => 'Ver inscrição',
  };
}

List<CategoryPrizeRow> categoryPrizeRows(TournamentCategoryOffer offer) {
  if (offer.prizes.isEmpty) return const [];

  final sorted = [
    ...offer.prizes,
  ]..sort((a, b) => _prizeOrder(a.position).compareTo(_prizeOrder(b.position)));

  return sorted
      .map(
        (p) => CategoryPrizeRow(
          positionLabel: _prizePositionLabel(p.position),
          amountLabel: _currencyFmt.format(p.value),
          highlight: _prizeOrder(p.position) == 1,
        ),
      )
      .toList();
}

int _prizeOrder(String position) {
  final digits = position.codeUnits.where((c) => c >= 48 && c <= 57).toList();
  if (digits.isEmpty) return 99;
  final n = int.tryParse(String.fromCharCodes(digits));
  return n ?? 99;
}

String _prizePositionLabel(String position) {
  final order = _prizeOrder(position);
  return switch (order) {
    1 => '1º lugar',
    2 => '2º lugar',
    3 => '3º lugar',
    _ => '$positionº lugar',
  };
}

String formatCategoryEntryFee(TournamentCategoryOffer offer) {
  final fee = offer.entryFee;
  if (fee <= 0) return r'R$ —';
  return _currencyFmt.format(fee);
}
