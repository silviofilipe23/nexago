/// `appConfig/benefitsClub`: liga o card do Hub para todos e diz quem testa.
class BenefitsClubConfig {
  const BenefitsClubConfig({this.enabled = false, this.testerUids = const []});

  /// Doc ausente ou ilegível: clube desligado e ninguém testando.
  static const BenefitsClubConfig disabled = BenefitsClubConfig();

  factory BenefitsClubConfig.fromMap(Map<String, dynamic>? data) {
    final uids = data?['testerUids'];
    return BenefitsClubConfig(
      enabled: data?['enabled'] == true,
      testerUids: uids is List
          ? List.unmodifiable(uids.whereType<String>())
          : const [],
    );
  }

  final bool enabled;
  final List<String> testerUids;
}
