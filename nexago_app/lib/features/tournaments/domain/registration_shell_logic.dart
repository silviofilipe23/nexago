import 'category_age_eligibility.dart';
import 'tournament_discovery_models.dart';

/// Estado de uma categoria no seletor da tela de inscrição.
///
/// Porte fiel de `categoryStatusOf` no shell do portal do atleta
/// (`tournament-registration-shell.component.ts`). A ordem das checagens é
/// parte do contrato: **já inscrito > encerrada > lotada > elegibilidade**.
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
}) {
  if (alreadyRegistered) {
    return const RegistrationCategoryStatus(
      badge: RegistrationCategoryStatus.kRegisteredBadge,
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

/// Vagas de convite ainda abertas.
///
/// **Dupla sempre tem uma vaga aberta**, mesmo com convite pendente: convidar
/// várias pessoas é caminho legítimo — o primeiro aceite fecha a vaga e o
/// backend derruba os demais (`markStaleInvitesAfterAccept`). Descontar o
/// convite pendente escondia a busca e deixava o atleta refém de quem não
/// respondia. Mesma conta do `remainingInviteSlots` no portal.
///
/// Em EQUIPE a vaga é finita de verdade: elenco + convites pendentes ocupam,
/// senão o capitão convida gente demais para um elenco que não cabe.
int registrationRemainingInviteSlots({
  required int? teamSize,
  required int rosterCount,
  required int pendingInviteCount,
}) {
  if (teamSize == null) return 1;
  final left = teamSize - rosterCount - pendingInviteCount;
  return left < 0 ? 0 : left;
}
