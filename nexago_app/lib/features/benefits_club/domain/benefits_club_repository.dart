import 'benefit_event.dart';
import 'benefits_club_config.dart';
import 'my_benefits.dart';
import 'partner.dart';
import 'partner_lead.dart';

/// Leitura da vitrine e da flag (as rules liberam para quem está logado) e os
/// salvos do atleta (`users/{uid}/benefits`, o dono só grava `saved`).
abstract interface class BenefitsClubRepository {
  /// Parceiros com `active == true`; o filtro de público e cidade é do app.
  Stream<List<Partner>> watchActivePartners();

  Stream<BenefitsClubConfig> watchConfig();

  /// Ids dos parceiros salvos (coração) pelo atleta.
  Stream<Set<String>> watchSavedPartnerIds(String uid);

  /// Grava `{saved, savedAt}` com merge (o resto do doc é do servidor).
  Future<void> setSaved({
    required String uid,
    required String partnerId,
    required bool saved,
  });
}

/// Callables do clube: o funil, o lead, o cupom com requisito e o histórico
/// só o servidor grava.
abstract interface class BenefitsClubService {
  Future<void> trackEvent({
    required BenefitEventType type,
    required BenefitSource source,
    String? partnerId,
  });

  /// Devolve a mensagem de sucesso do parceiro (pode vir vazia).
  Future<String> submitLead(PartnerLeadSubmission lead);

  /// Cupom do parceiro (público, privado de quem cumpre o requisito ou o
  /// código do atleta); `null` quando o parceiro não usa cupom.
  Future<String?> claimBenefit({
    required String partnerId,
    required BenefitSource source,
  });

  Future<MyBenefits> getMyBenefits();

  Future<void> answerBenefitUse({
    required String partnerId,
    required bool used,
  });
}
