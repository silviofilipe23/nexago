import 'benefit_event.dart';
import 'benefits_club_config.dart';
import 'partner.dart';
import 'partner_lead.dart';

/// Leitura da vitrine e da flag (as rules liberam para quem está logado).
abstract interface class BenefitsClubRepository {
  /// Parceiros com `active == true`; o filtro de público e cidade é do app.
  Stream<List<Partner>> watchActivePartners();

  Stream<BenefitsClubConfig> watchConfig();
}

/// Callables do clube: o funil e o lead só o servidor grava.
abstract interface class BenefitsClubService {
  Future<void> trackEvent({
    required BenefitEventType type,
    required BenefitSource source,
    String? partnerId,
  });

  /// Devolve a mensagem de sucesso do parceiro (pode vir vazia).
  Future<String> submitLead(PartnerLeadSubmission lead);
}
