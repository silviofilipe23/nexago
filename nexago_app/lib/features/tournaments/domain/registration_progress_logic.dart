import 'package:intl/intl.dart';

import 'tournament_discovery_models.dart';
import 'tournament_payment_mode.dart';
import 'tournament_uniform_selection.dart';

/// Acompanhamento de inscrição na Home (porte de `registration-progress.ts`
/// do portal do atleta): dado o doc da inscrição já resolvido, devolve a
/// trilha de passos ("Categoria → [Uniforme] → Dupla → Pagamento →
/// Confirmada"), em qual passo o atleta parou e o que o CTA deve fazer.
///
/// Módulo puro de propósito (sem Flutter, sem Firestore) — é onde a regra
/// mora e o que os testes exercitam. O widget só renderiza o que sai daqui.

enum RegistrationStepState { done, current, todo }

class RegistrationProgressStep {
  const RegistrationProgressStep({
    required this.label,
    required this.caption,
    required this.state,
  });

  final String label;
  final String caption;
  final RegistrationStepState state;
}

class RegistrationProgress {
  const RegistrationProgress({
    required this.registrationId,
    required this.tournamentId,
    required this.categoryId,
    required this.tournamentName,
    required this.categoryName,
    required this.waitlist,
    required this.steps,
    required this.pendingLabel,
    required this.currentStep,
    required this.totalSteps,
    required this.paymentPending,
    required this.canCancel,
    this.startAt,
  });

  final String registrationId;
  final String tournamentId;
  final String categoryId;
  final String tournamentName;
  final String categoryName;
  final bool waitlist;
  final List<RegistrationProgressStep> steps;

  /// Frase curta do que falta ("Falta o pagamento") — o passo atual em
  /// linguagem de gente.
  final String pendingLabel;

  /// 1-based — é o número que vai no chip `PASSO x/n`.
  final int currentStep;
  final int totalSteps;

  /// Só falta pagar (uniforme e dupla resolvidos) — o CTA leva direto ao
  /// pagamento em vez do começo do fluxo de inscrição.
  final bool paymentPending;

  /// Atleta pode cancelar direto (nenhum pagamento na inscrição).
  final bool canCancel;

  /// Início do torneio, pra ordenar a lista (mais próximo primeiro).
  final DateTime? startAt;
}

/// Slot do atleta no doc da inscrição. A regra mora em [uniformSlotFor], que a
/// tela de inscrição também usa — duas cópias divergiriam.
TournamentUniformSelection uniformSlotForRegistration(
  MyTournamentRegistration registration,
  String uid,
) {
  return uniformSlotFor(
    uid: uid,
    teamSize: registration.teamSize,
    uniformByUid: registration.uniformByUid,
    player1Id: registration.player1Id,
    participantUids: registration.participantUids,
    uniformPlayer1: registration.uniformPlayer1,
    uniformPlayer2: registration.uniformPlayer2,
  );
}

/// Uniforme do atleta está completo pros requisitos da categoria (mesma regra
/// da tela de inscrição — reusa `isUniformSelectionComplete` em vez de
/// duplicar o critério).
bool myUniformIsComplete(
  MyTournamentRegistration registration,
  TournamentCategoryOffer category,
  String uid,
) {
  if (!categoryRequiresUniform(category)) return true;
  return isUniformSelectionComplete(
    category: category,
    selection: uniformSlotForRegistration(registration, uid),
  );
}

String _formatBRL(double value) {
  return NumberFormat.currency(locale: 'pt_BR', symbol: r'R$').format(value);
}

String? _firstName(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  return trimmed.split(RegExp(r'\s+')).first;
}

String _partnerCaption(
  MyTournamentRegistration registration,
  String myName,
  String? partnerName,
) {
  // Equipe nomeada (trio+): a trilha conta o elenco, não "o parceiro".
  final teamSize = registration.teamSize;
  if (teamSize != null) {
    if (registration.partnerPending) {
      return 'Elenco ${registration.participantUids.length}/$teamSize';
    }
    return registration.teamName ?? 'Equipe completa';
  }
  if (registration.partnerPending) return 'Falta parceiro';
  final mine = _firstName(myName);
  final theirs = _firstName(partnerName);
  if (mine != null && theirs != null) return '$mine & $theirs';
  if (theirs != null) return theirs;
  return 'Dupla formada';
}

String _paymentCaption(
  MyTournamentRegistration registration,
  TournamentCategoryOffer category,
) {
  if (registration.isPaid) return 'Pago';
  if (registration.athleteHasReserved) return 'Sua parte paga';
  if (registration.paymentMode == TournamentPaymentMode.directWithOrganizer) {
    return 'Direto com o organizador';
  }
  if (category.entryFee <= 0) return 'Gratuito';
  // Equipe (trio+): a taxa é da equipe e cada atleta paga a própria cota.
  final teamSize = registration.teamSize ?? 2;
  if (teamSize > 2) {
    return 'Sua cota · ${_formatBRL(category.entryFee / teamSize)}';
  }
  return 'Sua metade · ${_formatBRL(category.entryFee / 2)}';
}

class _StepDraft {
  const _StepDraft({
    required this.label,
    required this.caption,
    required this.done,
  });

  final String label;
  final String caption;
  final bool done;
}

/// "Categoria" e "Confirmada" nunca podem ser o passo atual — a inscrição já
/// existe (1) e a confirmação só fica pendente junto com algum passo anterior.
const _pendingLabels = <String, String>{
  'Uniforme': 'Falta escolher o uniforme',
  'Dupla': 'Falta fechar a dupla',
  'Equipe': 'Falta completar a equipe',
  'Pagamento': 'Falta o pagamento',
};

/// `null` quando não há passo pendente (inscrição concluída não entra no
/// card) ou quando a categoria não resolveu no torneio.
RegistrationProgress? buildRegistrationProgress(
  MyTournamentRegistration registration, {
  required String myUid,
  required String myName,
  String? partnerName,
}) {
  final category = registration.category;
  if (category == null) return null;

  final uniformDone = myUniformIsComplete(registration, category, myUid);
  final partnerDone = !registration.partnerPending;
  final paymentDone = registration.isPaid;

  final drafts = <_StepDraft>[
    _StepDraft(label: 'Categoria', caption: category.name, done: true),
    if (categoryRequiresUniform(category))
      _StepDraft(
        label: 'Uniforme',
        caption: uniformDone ? 'Salvo' : 'Pendente',
        done: uniformDone,
      ),
    _StepDraft(
      label: registration.teamSize != null ? 'Equipe' : 'Dupla',
      caption: _partnerCaption(registration, myName, partnerName),
      done: partnerDone,
    ),
    _StepDraft(
      label: 'Pagamento',
      caption: _paymentCaption(registration, category),
      done: paymentDone,
    ),
    _StepDraft(
      label: 'Confirmada',
      caption: 'Vaga garantida',
      done: paymentDone && partnerDone,
    ),
  ];

  final currentIndex = drafts.indexWhere((step) => !step.done);
  if (currentIndex < 0) return null;

  // Estado visual monotônico: sem isso a trilha pode sair "concluído →
  // pendente → concluído" (ex.: uniforme pendente com pagamento já feito),
  // que lê como bug.
  final steps = <RegistrationProgressStep>[
    for (var i = 0; i < drafts.length; i++)
      RegistrationProgressStep(
        label: drafts[i].label,
        caption: drafts[i].caption,
        state: i < currentIndex
            ? RegistrationStepState.done
            : i == currentIndex
                ? RegistrationStepState.current
                : RegistrationStepState.todo,
      ),
  ];

  return RegistrationProgress(
    registrationId: registration.registrationId,
    tournamentId: registration.tournamentId,
    categoryId: registration.categoryId,
    tournamentName: registration.tournamentName,
    categoryName: category.name,
    waitlist: registration.isWaitlist,
    steps: steps,
    pendingLabel:
        _pendingLabels[drafts[currentIndex].label] ?? 'Inscrição em andamento',
    currentStep: currentIndex + 1,
    totalSteps: drafts.length,
    paymentPending: uniformDone && partnerDone && !paymentDone,
    canCancel: !registration.isPaid && !registration.hasPartialPayment,
    startAt: registration.startDate,
  );
}

/// Torneio/categoria que não resolve é descartado (não renderiza bloco
/// quebrado). Torneio cancelado também sai: a trilha existe pra empurrar o
/// atleta pro próximo passo, e não há próximo passo num torneio que não vai
/// acontecer. Ordena por início do torneio, crescente; sem data vai pro fim.
List<RegistrationProgress> buildInProgressRegistrations(
  List<MyTournamentRegistration> registrations, {
  required String myUid,
  required String myName,
  Map<String, String> partnerNameByUid = const {},
}) {
  final items = <RegistrationProgress>[];
  for (final registration in registrations) {
    if (registration.tournamentIsCancelled) continue;
    String? partnerUid;
    for (final uid in registration.participantUids) {
      if (uid != myUid) {
        partnerUid = uid;
        break;
      }
    }
    final progress = buildRegistrationProgress(
      registration,
      myUid: myUid,
      myName: myName,
      partnerName: partnerUid != null ? partnerNameByUid[partnerUid] : null,
    );
    if (progress != null) items.add(progress);
  }
  items.sort((a, b) {
    final aMs = a.startAt?.millisecondsSinceEpoch;
    final bMs = b.startAt?.millisecondsSinceEpoch;
    if (aMs == null && bMs == null) return 0;
    if (aMs == null) return 1;
    if (bMs == null) return -1;
    return aMs.compareTo(bMs);
  });
  return items;
}

/// Uids dos parceiros cujos nomes o card precisa buscar nos perfis.
List<String> partnerUidsOf(
  List<MyTournamentRegistration> registrations,
  String myUid,
) {
  final uids = <String>{};
  for (final registration in registrations) {
    for (final uid in registration.participantUids) {
      if (uid != myUid) uids.add(uid);
    }
  }
  return uids.toList();
}
