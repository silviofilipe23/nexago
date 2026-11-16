/// `appConfig/benefitsClub`: liga o card do Hub para todos, diz quem testa e
/// qual parceiro patrocina o card do Hub.
class BenefitsClubConfig {
  const BenefitsClubConfig({
    this.enabled = false,
    this.testerUids = const [],
    this.hubSponsorPartnerId,
  });

  /// Doc ausente ou ilegível: clube desligado e ninguém testando.
  static const BenefitsClubConfig disabled = BenefitsClubConfig();

  factory BenefitsClubConfig.fromMap(Map<String, dynamic>? data) {
    final uids = data?['testerUids'];
    final sponsor = data?['hubSponsorPartnerId'];
    return BenefitsClubConfig(
      enabled: data?['enabled'] == true,
      testerUids: uids is List
          ? List.unmodifiable(uids.whereType<String>())
          : const [],
      hubSponsorPartnerId: sponsor is String && sponsor.trim().isNotEmpty
          ? sponsor.trim()
          : null,
    );
  }

  final bool enabled;
  final List<String> testerUids;

  /// O card do Hub vira "Oferecido por <parceiro>" quando aponta para um
  /// parceiro visível para a pessoa.
  final String? hubSponsorPartnerId;
}
