import 'package:intl/intl.dart';

import '../data/tournament_registration_service.dart';
import 'tournament_category_spots.dart';
import 'tournament_detail_logic.dart';
import 'tournament_detail_model.dart';
import 'tournament_discovery_helpers.dart';
import 'tournament_discovery_models.dart';
import 'tournament_payment_mode.dart';
import 'tournament_uniform_selection.dart';

export 'tournament_uniform_selection.dart'
    show
        TournamentUniformSelection,
        categoryRequiresShorts,
        categoryRequiresUniform,
        defaultJerseyNameForAthlete,
        defaultUniformSelectionForCategory,
        fillJerseyNameDefaultIfNeeded,
        isUniformSelectionComplete,
        kDefaultUniformSizeOptionsTop,
        kUniformChangeDeadlineDays,
        uniformPayloadForPartnerInvite,
        uniformSizeOptionsShortsForCategory,
        uniformSizeOptionsTopForCategory,
        validateUniformSelection;

/// Taxa fixa da plataforma (espelha `PLATFORM_FEE_FIXED_BRL` no backend MP).
const double kTournamentPlatformFeeBrl = 2.0;

/// Inscrição solo com vaga de parceiro em aberto e pagamento pendente.
bool registrationAwaitingSoloPartner({
  required TournamentRegistrationSnapshot? snap,
  required bool isFullyPaid,
}) => snap?.partnerPending == true && !isFullyPaid;

/// Inscrição já paga (solo pagou o total) mas ainda sem parceiro: o atleta deve
/// convidar um parceiro, que entra SEM TAXA.
bool registrationPaidAwaitingPartner({
  required TournamentRegistrationSnapshot? snap,
}) => snap?.isPaid == true && snap?.partnerPending == true;

/// Inscrição cancelável pelo atleta: nenhum pagamento registrado — nem a dupla
/// confirmada, nem parcela de um dos dois. Espelha o guard da callable
/// `cancelTournamentRegistration`; com pagamento, o caminho é o organizador.
bool registrationCancellableByAthlete({
  required bool isPaid,
  required List<String> sharePaidUids,
  double paidAmount = 0,
}) => !isPaid && sharePaidUids.isEmpty && paidAmount <= 0;

enum TournamentRegistrationStep { category, uniform, partner, waiting, payment }

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
  return TournamentRegistrationStep.category;
}

TournamentRegistrationStep previousStepFromUniform() =>
    TournamentRegistrationStep.category;

class TournamentRegistrationQuote {
  const TournamentRegistrationQuote({
    required this.entryFee,
    this.platformFee = kTournamentPlatformFeeBrl,
    this.teamSize = 2,
  });

  final double entryFee;
  final double platformFee;

  /// Elenco da inscrição: 2 na dupla, 3–5 na categoria de EQUIPE (trio+).
  final int teamSize;

  /// Categoria de equipe nomeada (trio+).
  bool get isTeamCategory => teamSize > 2;

  /// Valor integral da inscrição (cobrado com `amountType: full`).
  double get displayTotal => entryFee;

  /// Parcela por atleta (`amountType: share`) — a taxa dividida pelo elenco.
  /// A cota exata (com resto de centavos) é conta do servidor; aqui é o valor
  /// exibido antes de gerar a cobrança.
  double get shareAmount => entryFee > 0 ? entryFee / teamSize : 0;

  /// "dupla" ou "equipe" — para as copies de pagamento.
  String get unitSingular => isTeamCategory ? 'equipe' : 'dupla';
}

TournamentRegistrationQuote buildRegistrationQuote({
  required double entryFee,
  double platformFee = kTournamentPlatformFeeBrl,
  int teamSize = 2,
}) {
  return TournamentRegistrationQuote(
    teamSize: teamSize < 2 ? 2 : teamSize,
    entryFee: entryFee < 0 ? 0 : entryFee,
    platformFee: platformFee,
  );
}

/// Inscrição paga exige PIX; taxa zero confirma sem pagamento.
bool registrationRequiresPayment(TournamentRegistrationQuote quote) =>
    quote.entryFee > 0;

bool tournamentUsesDirectOrganizerPayment(TournamentDetail tournament) =>
    tournament.paymentMode == TournamentPaymentMode.directWithOrganizer;

/// PIX no app só quando há taxa e o torneio não usa pagamento direto.
bool registrationRequiresAppPayment(
  TournamentRegistrationQuote quote,
  TournamentDetail tournament,
) =>
    registrationRequiresPayment(quote) &&
    !tournamentUsesDirectOrganizerPayment(tournament);

/// Texto explicativo do passo de pagamento direto (valor da dupla/equipe).
String directOrganizerPaymentBody(TournamentRegistrationQuote quote) {
  final amount = formatRegistrationMoney(quote.displayTotal);
  return 'A inscrição deste torneio não é cobrada pelo app. '
      'O valor de $amount por ${quote.unitSingular} é combinado e pago diretamente com o organizador.';
}

/// Partes em negrito para [directOrganizerPaymentBody].
(String before, String bold, String after) directOrganizerPaymentBodyParts(
  TournamentRegistrationQuote quote,
) {
  final amount = formatRegistrationMoney(quote.displayTotal);
  return (
    'A inscrição deste torneio ',
    'não é cobrada pelo app',
    '. O valor de $amount por ${quote.unitSingular} é combinado e pago diretamente com o organizador.',
  );
}

/// Alerta de pré-reserva no passo de pagamento direto.
(String before, String bold, String after)
directOrganizerPrereserveAlertParts() => (
  'Ao reservar, sua vaga fica ',
  'pré-reservada',
  '. A inscrição só é confirmada quando o organizador registrar o pagamento.',
);

/// Subtítulo do passo 2 (valor da dupla/equipe).
String directOrganizerPaymentStep2Subtitle(TournamentRegistrationQuote quote) {
  final amount = formatRegistrationMoney(quote.displayTotal);
  return '$amount por ${quote.unitSingular}, direto com o organizador (Pix, dinheiro ou maquininha).';
}

/// Valor do PIX no painel direto (parcela ou integral).
double directOrganizerPixAmount(
  TournamentRegistrationQuote quote,
  String amountType,
) {
  return amountType == 'full' ? quote.displayTotal : quote.shareAmount;
}

/// Aviso de coordenação entre os atletas no pagamento direto.
String directOrganizerShareHint(
  TournamentRegistrationQuote quote,
  String amountType,
) {
  if (amountType == 'full') {
    return quote.isTeamCategory
        ? 'Você está pagando o valor integral da equipe. '
              'Combine com o elenco para ninguém pagar também.'
        : 'Você está pagando o valor integral da dupla. '
              'Combine com seu parceiro para ele não pagar também.';
  }
  final each = formatRegistrationMoney(quote.shareAmount);
  return quote.isTeamCategory
      ? 'Cada atleta paga $each. Confirme com sua equipe antes de enviar o PIX.'
      : 'Cada atleta paga $each. Confirme com seu parceiro antes de enviar o PIX.';
}

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
  final capitalizedMonth = month.isEmpty
      ? month
      : '${month[0].toUpperCase()}${month.substring(1)}';

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
  final gender = includeGender ? categoryGenderDisplayLabel(offer) : '';
  final capacity = categoryMaxTeams(offer);
  if (capacity <= 0) {
    return gender.isNotEmpty ? gender : 'Vagas a confirmar';
  }

  final enrolled = categoryEnrolledCount(
    offer,
    inscriptionCount: inscriptionCount,
  );
  // Categoria de EQUIPE (trio+) tem unidade própria e leva o formato no texto:
  // "Trio · Misto · 8 equipes · 5/8 inscritas".
  final unit = offer.isTeamCategory
      ? offer.unitLabel
      : format == TournamentFormat.dupla
      ? 'duplas'
      : 'vagas';
  final spots = '$capacity $unit · $enrolled/$capacity inscritas';
  final parts = <String>[
    if (offer.isTeamCategory) offer.formatLabel,
    if (gender.isNotEmpty) gender,
    if (offer.isTeamCategory && offer.genderDetail != null &&
        offer.genderDetail != 'Livre')
      offer.genderDetail!,
    spots,
  ];
  return parts.join(' · ');
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
  // Categoria de EQUIPE: "livre" aceita qualquer atleta; composição de gênero
  // único restringe; misto exato aceita ambos (as vagas por gênero são conta
  // do backend, validadas contra elenco + convites pendentes).
  if (offer.isTeamCategory) {
    if (offer.genderFree) return true;
    final men = offer.genderCompositionMen;
    final women = offer.genderCompositionWomen;
    if (men != null && women != null) {
      final athlete = athleteGender?.trim();
      if (women == 0) return athlete == 'Masculino';
      if (men == 0) return athlete == 'Feminino';
      return true;
    }
  }
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
  final amount = amountType == 'full' ? quote.displayTotal : quote.shareAmount;
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
String tournamentInviteReservationHoursLabel(
  DateTime expiresAt,
  DateTime createdAt,
) {
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
  return inviteAccepted && registrationId != null && registrationId.isNotEmpty;
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
  bool isDirectOrganizerPayment = false,
}) {
  if (isPaid) return 'Inscrição confirmada — dupla inscrita no torneio.';
  if (!registrationRequiresPayment(quote) || isDirectOrganizerPayment) {
    final selfConfirmed = currentAthleteSharePaid(
      sharePaidUids: sharePaidUids,
      athleteUid: currentAthleteUid,
    );
    if (isDirectOrganizerPayment) {
      if (selfConfirmed) {
        return 'Vaga reservada. Aguardando seu parceiro reservar a dele.';
      }
      if (sharePaidUids.isNotEmpty) {
        return 'Seu parceiro já reservou. Reserve sua vaga.';
      }
      return 'Cada atleta precisa reservar sua vaga.';
    }
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
  if (selfPaid ||
      registrationSharePaid(
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
}) => canAccess && stepEnabled;

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
  bool partnerPending = false,
}) {
  if (!isPaid) return RegistrationSuccessNavigationAction.ignore;
  // Pago mas ainda sem parceiro (solo pagou o total): não vai para sucesso;
  // o atleta precisa convidar o parceiro grátis primeiro.
  if (partnerPending) return RegistrationSuccessNavigationAction.ignore;
  if (alreadyHandled) return RegistrationSuccessNavigationAction.ignore;
  if (wasPaid) return RegistrationSuccessNavigationAction.ignore;

  final isRealTransition = hasPreviousSnapshot || seenUnpaid;
  if (!isRealTransition) {
    return RegistrationSuccessNavigationAction.markHandledOnly;
  }
  return RegistrationSuccessNavigationAction.navigate;
}
