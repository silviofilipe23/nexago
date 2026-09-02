import 'category_age_eligibility.dart';
import 'tournament_discovery_labels.dart';
import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';

/// Estado de uma categoria no passo 1 do wizard de inscrição.
///
/// Nasceu como porte fiel de `categoryStatusOf` do shell do portal do atleta.
/// A paridade com a web, quebrada quando o app virou passo a passo em
/// 2026-09-01, foi **restaurada** em 2026-09-02: o portal ganhou o mesmo wizard
/// e o gêmeo desta função vive em
/// `frontend/projects/athlete/src/app/tournaments/registration/wizard/registration-category-status.ts`.
/// Mexeu aqui, mexa lá. A ordem das checagens é contrato nas duas:
/// já inscrito > prazo encerrado > em breve > encerrada > lotada > elegibilidade.
///
/// "JÁ INSCRITO" é deliberadamente `blocked: false` — a vaga já é do atleta, e
/// bloquear o toque foi exatamente o beco sem saída que a inscrição solo
/// pendente sofria: quem reservou sem parceiro não tinha como voltar ao
/// convite.
class RegistrationCategoryStatus {
  const RegistrationCategoryStatus({
    this.badge,
    this.blocked = false,
    this.message,
  });

  /// Selo curto do card ("JÁ INSCRITO", "LOTADO", "NÍVEL"…). `null` = sem selo.
  final String? badge;

  /// Impede criar inscrição nova nesta categoria.
  final bool blocked;

  /// Motivo em uma frase, para o CTA e o aviso sob o card.
  final String? message;

  bool get isRegistered => badge == kRegisteredBadge;

  static const kRegisteredBadge = 'JÁ INSCRITO';
}

/// Elegibilidade já avaliada pela tela (nível/idade/gênero), para manter esta
/// função pura e testável sem perfil nem providers.
class RegistrationEligibilityInput {
  const RegistrationEligibilityInput({
    this.levelBlocked = false,
    this.belowMinLevel = false,
    this.ageEligibility = AgeEligibility.eligible,
    this.genderBlocked = false,
  });

  final bool levelBlocked;
  final bool belowMinLevel;
  final AgeEligibility ageEligibility;
  final bool genderBlocked;
}

/// Status da categoria para o seletor e o CTA.
///
/// [spotsLeft] `null` = capacidade desconhecida (categoria sem teto ou contagem
/// ainda não resolvida) — nunca vira "LOTADO" no escuro.
RegistrationCategoryStatus registrationCategoryStatus({
  required TournamentCategoryOffer offer,
  required bool alreadyRegistered,
  required int? spotsLeft,
  RegistrationEligibilityInput eligibility = const RegistrationEligibilityInput(),
  DateTime? registrationOpensAt,
  DateTime? registrationClosesAt,
  DateTime? now,
}) {
  if (alreadyRegistered) {
    return const RegistrationCategoryStatus(
      badge: RegistrationCategoryStatus.kRegisteredBadge,
    );
  }
  // Espelha o guard do servidor (`assertTournamentAcceptsRegistration`): o
  // calendário do torneio vem antes das travas de categoria, e o PRAZO vem
  // antes da abertura (é a ordem das checagens da CF). Sem isto o app exibia
  // "Inscrições até …" e mesmo assim deixava o atleta percorrer três telas
  // para a callable recusar com "Prazo de inscrição encerrado.".
  if (registrationClosesAt != null &&
      (now ?? DateTime.now()).isAfter(registrationClosesAt)) {
    return const RegistrationCategoryStatus(
      badge: 'ENCERRADA',
      blocked: true,
      message: 'O prazo de inscrição deste torneio já passou.',
    );
  }
  // Antes de `registrationOpensAt` a CF recusa qualquer inscrição, então a
  // tela precisa dizer quando abre — não que "encerrou".
  if (tournamentRegistrationNotYetOpen(registrationOpensAt, now: now)) {
    return RegistrationCategoryStatus(
      badge: 'EM BREVE',
      blocked: true,
      message:
          'As inscrições ainda não abriram. '
          '${tournamentRegistrationOpensLabel(registrationOpensAt!)}.',
    );
  }
  if (offer.registrationClosed || offer.isCompleted) {
    return const RegistrationCategoryStatus(
      badge: 'ENCERRADA',
      blocked: true,
      message: 'As inscrições desta categoria estão encerradas.',
    );
  }
  if (spotsLeft != null && spotsLeft <= 0) {
    return const RegistrationCategoryStatus(
      badge: 'LOTADO',
      blocked: true,
      message: 'Esta categoria está lotada.',
    );
  }
  if (eligibility.genderBlocked) {
    return const RegistrationCategoryStatus(
      badge: 'GÊNERO',
      blocked: true,
      message: 'Esta categoria não aceita o gênero do seu perfil.',
    );
  }
  if (eligibility.ageEligibility != AgeEligibility.eligible) {
    return RegistrationCategoryStatus(
      badge: CategoryAgeEligibility.blockBadgeLabel(eligibility.ageEligibility),
      blocked: true,
      message: CategoryAgeEligibility.blockMessage(
        offer,
        eligibility.ageEligibility,
      ),
    );
  }
  if (eligibility.belowMinLevel) {
    return const RegistrationCategoryStatus(
      badge: 'NÍVEL',
      blocked: true,
      message: 'Esta categoria tem nível mínimo acima do seu.',
    );
  }
  if (eligibility.levelBlocked) {
    return const RegistrationCategoryStatus(
      badge: 'NÍVEL',
      blocked: true,
      message: 'Seu nível é acima desta categoria. Escolha uma categoria igual '
          'ou acima do seu nível.',
    );
  }
  return const RegistrationCategoryStatus();
}

/// Estados exclusivos do cartão "Sua inscrição" — a mesma cadeia `@if/@else if`
/// do template da web, na mesma ordem.
enum RegistrationCardState {
  /// Convite recebido para esta categoria: aceitar/recusar vem antes de tudo.
  receivedInvite,

  /// Sem inscrição: reservar vaga (dupla) ou criar equipe (trio+).
  notRegistered,

  /// Inscrito, elenco incompleto: convites e busca de parceiro.
  awaitingRoster,

  /// Elenco fechado, falta pagar.
  awaitingPayment,

  /// Paga e confirmada.
  confirmed,
}

RegistrationCardState registrationCardState({
  required bool hasReceivedInvite,
  required bool hasRegistration,
  required bool partnerPending,
  required bool isPaid,
}) {
  if (hasReceivedInvite && !hasRegistration) {
    return RegistrationCardState.receivedInvite;
  }
  if (!hasRegistration) return RegistrationCardState.notRegistered;
  if (partnerPending) return RegistrationCardState.awaitingRoster;
  if (!isPaid) return RegistrationCardState.awaitingPayment;
  return RegistrationCardState.confirmed;
}

/// Rótulo de status do cartão de resumo (coluna lateral da web).
String registrationSummaryStatusLabel({
  required bool hasRegistration,
  required bool partnerPending,
  required bool isPaid,
  required bool isTeamCategory,
  required int rosterCount,
  required int teamSize,
  required int sentInviteCount,
}) {
  if (!hasRegistration) return 'Não inscrito';
  if (partnerPending) {
    if (isTeamCategory) return 'Elenco $rosterCount/$teamSize';
    // Solo pagou o valor integral: a vaga já é dele, só falta o parceiro.
    if (isPaid) return 'Vaga garantida — falta parceiro';
    if (sentInviteCount > 1) return 'Convites enviados';
    if (sentInviteCount == 1) return 'Convite enviado';
    return 'Falta parceiro';
  }
  if (!isPaid) return 'Aguardando pagamento';
  return 'Confirmada';
}

/// Número do passo do cartão "Sua inscrição": 3 quando há cartão de uniforme
/// no meio, 2 quando não há. Espelha `registrationStepNum` da web.
int registrationCardStepNumber({required bool uniformRequired}) =>
    uniformRequired ? 3 : 2;

/// Nota no topo do elenco incompleto. Com convite pendente na dupla a busca
/// some da tela, então a nota troca o "busque e convide" pelo estado real:
/// aguardando a resposta do convidado.
String registrationRosterNote({
  required bool isTeamCategory,
  required int rosterCount,
  required int teamSize,
  required bool isCaptain,
  required bool isPaid,
  required bool hasPendingInvite,
  bool requiresFormedPair = false,
}) {
  if (isTeamCategory) {
    return 'Elenco $rosterCount/$teamSize. '
        '${isCaptain ? 'Convide os atletas que faltam.' : 'O capitão está montando o elenco.'}';
  }
  // Dupla já formada: ainda NÃO existe inscrição, então a nota não pode
  // prometer vaga reservada — ela nasce no aceite do convite.
  if (requiresFormedPair) {
    return hasPendingInvite
        ? 'Convite enviado! A vaga é criada quando seu parceiro aceitar — até '
              'lá ela não fica reservada.'
        : 'Este torneio exige dupla já formada. Convide seu parceiro: a vaga '
              'é criada quando ele aceitar.';
  }
  if (isPaid) {
    return hasPendingInvite
        ? 'Vaga garantida! Convite enviado — seu parceiro entra sem taxa '
              'assim que aceitar.'
        : 'Vaga garantida! Você pagou o valor integral — convide seu '
              'parceiro, ele entra sem taxa.';
  }
  return hasPendingInvite
      ? 'Convite enviado! Agora é só aguardar a resposta do seu parceiro.'
      : 'Vaga reservada! Agora busque e convide seu parceiro de dupla.';
}

/// Entrada da inscrição SEM reserva solo: o torneio exige dupla já formada e a
/// categoria é de dupla. Equipe (trio+) não entra aqui — ela já nasce nomeada
/// pelo fluxo de equipe, que nunca teve reserva solo.
bool registrationRequiresFormedPairEntry({
  required bool tournamentRequiresFormedPair,
  required bool isTeamCategory,
}) {
  return tournamentRequiresFormedPair && !isTeamCategory;
}

/// Vagas de convite ainda abertas.
///
/// Na DUPLA o convite pendente fecha a busca: depois de convidar, a lista de
/// atletas some e o caminho para chamar outra pessoa é cancelar o convite.
/// Convites antigos em paralelo continuam válidos — o primeiro aceite fecha a
/// vaga e o backend derruba os demais (`markStaleInvitesAfterAccept`).
///
/// Em EQUIPE a vaga é finita de verdade: elenco + convites pendentes ocupam,
/// senão o capitão convida gente demais para um elenco que não cabe.
int registrationRemainingInviteSlots({
  required int? teamSize,
  required int rosterCount,
  required int pendingInviteCount,
}) {
  if (teamSize == null) return pendingInviteCount > 0 ? 0 : 1;
  final left = teamSize - rosterCount - pendingInviteCount;
  return left < 0 ? 0 : left;
}

/// Prazo efetivo para concluir o pagamento: o mais cedo entre a garantia
/// da vaga (`holdExpiresAt`) e o vencimento da cobrança PIX.
DateTime? registrationEffectivePaymentDeadline({
  required DateTime? holdExpiresAt,
  required DateTime? pixExpiresAt,
}) {
  if (holdExpiresAt == null) return pixExpiresAt;
  if (pixExpiresAt == null) return holdExpiresAt;
  return holdExpiresAt.isBefore(pixExpiresAt) ? holdExpiresAt : pixExpiresAt;
}

/// Janela total do countdown de pagamento — vem do torneio, não do tempo
/// restante no mount (senão voltar à tela reinicia barra e rótulo).
Duration registrationHoldCountdownTotalWindow({required int holdMinutes}) {
  return Duration(minutes: holdMinutes.clamp(1, 9999));
}

/// Aviso do prazo de garantia da vaga na inscrição ainda não paga, ou `null`
/// quando não há relógio para mostrar.
///
/// O relógio só é real quando ninguém está esperando resposta de convite: com
/// convite pendente vivo a vaga acompanha o convite (48h), e uma contagem ali
/// mentiria sobre quanto tempo o atleta tem. Inscrição sem `holdExpiresAt` —
/// anterior à regra, criada pelo organizador, em fila de espera ou de torneio
/// com o prazo desligado — também não mostra nada.
String? registrationHoldNotice({
  required DateTime? holdExpiresAt,
  required bool isPaid,
  required bool hasLivePartnerInvite,
  DateTime? now,
}) {
  if (holdExpiresAt == null || isPaid || hasLivePartnerInvite) return null;
  final clock = now ?? DateTime.now();
  final remaining = holdExpiresAt.difference(clock);
  if (remaining.inSeconds <= 0) {
    return 'Prazo encerrado — sua vaga será liberada.';
  }
  return 'Vaga garantida até ${_holdClockLabel(holdExpiresAt, clock)} · '
      '${_holdRemainingLabel(remaining)}';
}

/// Hora de parede local do vencimento; ganha a data quando não é hoje.
String _holdClockLabel(DateTime expiresAt, DateTime now) {
  final at = expiresAt.toLocal();
  final hh = at.hour.toString().padLeft(2, '0');
  final mm = at.minute.toString().padLeft(2, '0');
  final sameDay =
      at.year == now.year && at.month == now.month && at.day == now.day;
  if (sameDay) return '$hh:$mm';
  final dd = at.day.toString().padLeft(2, '0');
  final mo = at.month.toString().padLeft(2, '0');
  return '$dd/$mo $hh:$mm';
}

String _holdRemainingLabel(Duration remaining) {
  if (remaining.inMinutes < 1) return 'falta menos de 1 min';
  if (remaining.inMinutes < 60) return 'faltam ${remaining.inMinutes} min';
  if (remaining.inHours < 24) {
    final hours = remaining.inHours;
    return hours == 1 ? 'falta 1 hora' : 'faltam $hours horas';
  }
  final days = remaining.inDays;
  return days == 1 ? 'falta 1 dia' : 'faltam $days dias';
}
