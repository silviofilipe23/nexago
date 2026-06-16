import 'package:intl/intl.dart';

import 'tournament_category_spots.dart';
import 'tournament_detail_logic.dart';
import 'tournament_detail_model.dart';
import 'tournament_discovery_helpers.dart';
import 'tournament_discovery_models.dart';
import 'tournament_uniform_selection.dart';

export 'tournament_uniform_selection.dart'
    show
        TournamentUniformSelection,
        categoryRequiresShorts,
        categoryRequiresUniform,
        isUniformSelectionComplete,
        kDefaultUniformSizeOptionsTop,
        kUniformChangeDeadlineDays,
        uniformSizeOptionsShortsForCategory,
        uniformSizeOptionsTopForCategory,
        validateUniformSelection;

/// Taxa fixa da plataforma (espelha `PLATFORM_FEE_FIXED_BRL` no backend MP).
const double kTournamentPlatformFeeBrl = 2.0;

enum TournamentRegistrationStep {
  category,
  summary,
  uniform,
  partner,
  waiting,
  payment,
}

class TournamentRegistrationPartnerCandidate {
  const TournamentRegistrationPartnerCandidate({
    required this.userId,
    required this.initials,
    required this.name,
    required this.rankLabel,
    this.tagLabel,
    this.avatarUrl,
  });

  final String userId;
  final String initials;
  final String name;
  final String rankLabel;
  final String? tagLabel;
  final String? avatarUrl;
}

String partnerResultsHeader({
  required int count,
  required TournamentCategoryOffer category,
}) {
  final label = categoryBadgeLabel(category);
  final n = count == 1 ? '1 RESULTADO' : '$count RESULTADOS';
  return '$n · $label';
}

String registrationHeaderTitle(TournamentRegistrationStep step) {
  switch (step) {
    case TournamentRegistrationStep.partner:
      return 'Convidar parceiro';
    default:
      return 'Inscrição';
  }
}

bool registrationStepShowsHero(TournamentRegistrationStep step) {
  return step != TournamentRegistrationStep.partner &&
      step != TournamentRegistrationStep.waiting &&
      step != TournamentRegistrationStep.uniform;
}

TournamentRegistrationStep nextStepAfterSummary(
  TournamentCategoryOffer? category,
) {
  if (category != null && categoryRequiresUniform(category)) {
    return TournamentRegistrationStep.uniform;
  }
  return TournamentRegistrationStep.partner;
}

TournamentRegistrationStep previousStepFromPartner(
  TournamentCategoryOffer? category,
) {
  if (category != null && categoryRequiresUniform(category)) {
    return TournamentRegistrationStep.uniform;
  }
  return TournamentRegistrationStep.summary;
}

TournamentRegistrationStep previousStepFromUniform() =>
    TournamentRegistrationStep.summary;

class TournamentRegistrationQuote {
  const TournamentRegistrationQuote({
    required this.entryFee,
    this.platformFee = kTournamentPlatformFeeBrl,
  });

  final double entryFee;
  final double platformFee;

  /// Valor integral da dupla (cobrado no MP com `amountType: full`).
  double get displayTotal => entryFee;

  /// Parcela por atleta (`amountType: share`).
  double get shareAmount => entryFee > 0 ? entryFee / 2 : 0;
}

TournamentRegistrationQuote buildRegistrationQuote({
  required double entryFee,
  double platformFee = kTournamentPlatformFeeBrl,
}) {
  return TournamentRegistrationQuote(
    entryFee: entryFee < 0 ? 0 : entryFee,
    platformFee: platformFee,
  );
}

/// Inscrição paga exige PIX; taxa zero confirma sem pagamento.
bool registrationRequiresPayment(TournamentRegistrationQuote quote) =>
    quote.entryFee > 0;

String formatRegistrationMoney(double value) => formatMoney(value);

/// Badge do hero (ex.: `COPA GOIÁS 2026`).
String leagueBadgeLabel(ResolvedLeagueContext? leagueContext) {
  if (leagueContext == null) return 'TORNEIO';
  final league = leagueContext.league;
  final season = league.seasonLabel?.trim();
  if (season != null && season.isNotEmpty) {
    return '${league.name.toUpperCase()} · $season'.toUpperCase();
  }
  return league.name.toUpperCase();
}

final _compactDayFmt = DateFormat('d', 'pt_BR');
final _compactMonthFmt = DateFormat('MMM', 'pt_BR');

/// Subtítulo do hero: `18–20 Mai · Arena Garden · Goiânia`.
String tournamentRegistrationHeroSubtitle(TournamentDetail tournament) {
  final datePart = _compactDateRange(tournament);
  final city = tournament.city.trim();
  final location = tournament.location.trim();
  final place = city.isEmpty ? location : '$location · $city';
  if (datePart.isEmpty) return place;
  if (place.isEmpty) return datePart;
  return '$datePart · $place';
}

String _compactDateRange(TournamentDetail tournament) {
  final start = tournament.startDate;
  final end = tournament.endDate;
  final month = _compactMonthFmt.format(start);
  final capitalizedMonth =
      month.isEmpty ? month : '${month[0].toUpperCase()}${month.substring(1)}';

  if (end != null &&
      (end.year != start.year ||
          end.month != start.month ||
          end.day != start.day)) {
    final endMonth = _compactMonthFmt.format(end);
    final endCap = endMonth.isEmpty
        ? endMonth
        : '${endMonth[0].toUpperCase()}${endMonth.substring(1)}';
    if (start.month == end.month && start.year == end.year) {
      return '${_compactDayFmt.format(start)}–${_compactDayFmt.format(end)} $capitalizedMonth';
    }
    return '${_compactDayFmt.format(start)} $capitalizedMonth – ${_compactDayFmt.format(end)} $endCap';
  }

  final label = tournament.dateLabel.trim();
  if (label.isNotEmpty) return label;
  return '${_compactDayFmt.format(start)} $capitalizedMonth';
}

/// Chip da categoria (ex.: `S19`, `MC`).
String categoryBadgeLabel(TournamentCategoryOffer offer) {
  final level = offer.level.trim();
  if (level.isNotEmpty) {
    final compact = level.split(' ').join();
    if (compact.length <= 4) return compact.toUpperCase();
    return compact.substring(0, 4).toUpperCase();
  }

  final name = offer.name.trim();
  if (name.isEmpty) return 'CAT';

  final words = name.split(' ');
  if (words.length >= 2) {
    final initials = words
        .where((w) => w.isNotEmpty)
        .map((w) => w[0])
        .take(3)
        .join();
    return initials.toUpperCase();
  }

  return name.length <= 4
      ? name.toUpperCase()
      : name.substring(0, 4).toUpperCase();
}

/// Género da categoria para exibição (Masculino, Feminino, Misto).
String categoryGenderDisplayLabel(TournamentCategoryOffer offer) {
  return categoryGenderDisplayLabelFromTag(tournamentCategoryGenderTag(offer));
}

/// Subtítulo do card de categoria: `Masculino · 8 duplas · 5/8 inscritas`.
String categoryRegistrationSubtitle(
  TournamentCategoryOffer offer, {
  TournamentFormat format = TournamentFormat.dupla,
  int? inscriptionCount,
  bool includeGender = true,
}) {
  final gender =
      includeGender ? categoryGenderDisplayLabel(offer) : '';
  final capacity = categoryMaxTeams(offer);
  if (capacity <= 0) {
    return gender.isNotEmpty ? gender : 'Vagas a confirmar';
  }

  final enrolled = categoryEnrolledCount(
    offer,
    inscriptionCount: inscriptionCount,
  );
  final unit = format == TournamentFormat.dupla ? 'duplas' : 'vagas';
  final spots = '$capacity $unit · $enrolled/$capacity inscritas';
  if (gender.isNotEmpty) return '$gender · $spots';
  return spots;
}

bool isCategorySelectable(
  TournamentCategoryOffer offer, {
  int? inscriptionCount,
}) {
  if (offer.registrationClosed || offer.isCompleted) return false;
  final capacity = categoryMaxTeams(offer);
  if (capacity > 0 &&
      categorySpotsLeft(offer, inscriptionCount: inscriptionCount) <= 0) {
    return false;
  }
  return true;
}

/// Compatibilidade de gênero entre perfil do atleta e categoria.
bool athleteMatchesCategoryGender(
  TournamentCategoryOffer offer,
  String? athleteGender,
) {
  final categoryGender = categoryGenderDisplayLabel(offer);
  if (categoryGender.isEmpty || categoryGender == 'Misto') return true;
  final athlete = athleteGender?.trim();
  if (athlete == null || athlete.isEmpty) return false;
  return athlete == categoryGender;
}

String paymentAmountLabel({
  required TournamentRegistrationQuote quote,
  required String amountType,
}) {
  final amount =
      amountType == 'full' ? quote.displayTotal : quote.shareAmount;
  return formatRegistrationMoney(amount);
}

/// Rótulo de expiração do convite para o card da dupla.
String tournamentInviteExpiryLabel(DateTime expiresAt, [DateTime? now]) {
  final clock = now ?? DateTime.now();
  final remaining = expiresAt.difference(clock);
  if (remaining.isNegative) return 'Expirado';
  if (remaining.inHours >= 1) {
    final h = remaining.inHours;
    final m = remaining.inMinutes % 60;
    if (m > 0) return 'expira em ${h}h ${m}min';
    return 'expira em ${h}h';
  }
  if (remaining.inMinutes > 0) {
    return 'expira em ${remaining.inMinutes} min';
  }
  return 'expira em breve';
}

/// Horas de reserva exibidas no texto do passo de espera.
String tournamentInviteReservationHoursLabel(DateTime expiresAt, DateTime createdAt) {
  final hours = expiresAt.difference(createdAt).inHours;
  if (hours <= 0) return '24 horas';
  if (hours == 1) return '1 hora';
  return '$hours horas';
}

/// CTA de pagamento habilitado só após convite aceito e inscrição criada.
bool registrationWaitingCanProceed({
  required bool inviteAccepted,
  required String? registrationId,
}) {
  return inviteAccepted &&
      registrationId != null &&
      registrationId.isNotEmpty;
}

/// Parcela do atleta autenticado já consta em `sharePaidUids`.
bool currentAthleteSharePaid({
  required List<String> sharePaidUids,
  required String? athleteUid,
}) {
  if (athleteUid == null || athleteUid.isEmpty) return false;
  return sharePaidUids.contains(athleteUid);
}

/// Uma parcela (`share`) já foi paga (aproximação via `paidAmount` acumulado).
bool registrationSharePaid({
  required double paidAmount,
  required double shareAmount,
}) {
  if (shareAmount <= 0) return paidAmount > 0;
  return paidAmount >= shareAmount - 0.01;
}

/// Texto de progresso do pagamento em dupla.
String registrationDualPaymentProgressLabel({
  required TournamentRegistrationQuote quote,
  required double paidAmount,
  required bool isPaid,
  List<String> sharePaidUids = const [],
  String? currentAthleteUid,
}) {
  if (isPaid) return 'Inscrição confirmada — dupla inscrita no torneio.';
  if (!registrationRequiresPayment(quote)) {
    final selfConfirmed = currentAthleteSharePaid(
      sharePaidUids: sharePaidUids,
      athleteUid: currentAthleteUid,
    );
    if (selfConfirmed) {
      return 'Você confirmou. Aguardando seu parceiro confirmar a inscrição.';
    }
    if (sharePaidUids.isNotEmpty) {
      return 'Seu parceiro já confirmou. Confirme sua inscrição gratuita.';
    }
    return 'Cada atleta precisa confirmar a inscrição gratuita.';
  }
  final selfPaid = currentAthleteSharePaid(
    sharePaidUids: sharePaidUids,
    athleteUid: currentAthleteUid,
  );
  if (paidAmount <= 0 && !selfPaid) {
    return 'Aguardando o pagamento de cada atleta (sua parcela + parceiro).';
  }
  if (selfPaid || registrationSharePaid(
    paidAmount: paidAmount,
    shareAmount: quote.shareAmount,
  )) {
    final remaining = (quote.displayTotal - paidAmount)
        .clamp(0.0, quote.displayTotal)
        .toDouble();
    if (remaining > 0.01) {
      return 'Sua parcela paga. Falta ${formatRegistrationMoney(remaining)} para confirmar a dupla.';
    }
  }
  if (paidAmount > 0) {
    return 'Pagamento parcial: ${formatRegistrationMoney(paidAmount)} de ${formatRegistrationMoney(quote.displayTotal)}.';
  }
  return 'Aguardando o pagamento de cada atleta (sua parcela + parceiro).';
}

/// Sticky da inscrição só habilita ações quando o perfil permite torneios.
bool registrationStickyEnabled({
  required bool canAccess,
  required bool stepEnabled,
}) =>
    canAccess && stepEnabled;

/// Resultado da avaliação de auto-navegação para a tela de confirmação.
enum RegistrationSuccessNavigationAction {
  /// Ignorar (já tratado, ainda não pago ou sem transição real).
  ignore,

  /// Inscrição já paga no primeiro snapshot — marcar como tratado sem navegar.
  markHandledOnly,

  /// Transição real para pago — navegar para confirmação.
  navigate,
}

/// Decide se o coordinator deve abrir a tela de confirmação após pagamento.
RegistrationSuccessNavigationAction registrationSuccessNavigationAction({
  required bool isPaid,
  required bool wasPaid,
  required bool hasPreviousSnapshot,
  required bool seenUnpaid,
  required bool alreadyHandled,
}) {
  if (!isPaid) return RegistrationSuccessNavigationAction.ignore;
  if (alreadyHandled) return RegistrationSuccessNavigationAction.ignore;
  if (wasPaid) return RegistrationSuccessNavigationAction.ignore;

  final isRealTransition = hasPreviousSnapshot || seenUnpaid;
  if (!isRealTransition) {
    return RegistrationSuccessNavigationAction.markHandledOnly;
  }
  return RegistrationSuccessNavigationAction.navigate;
}
