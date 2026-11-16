import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/benefits_club_config.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/benefits_club_repository.dart';
import '../domain/partner.dart';
import '../infrastructure/callable_benefits_club_service.dart';
import '../infrastructure/firestore_benefits_club_repository.dart';
import 'benefits_club_tracker.dart';

final benefitsClubRepositoryProvider = Provider<BenefitsClubRepository>(
  (ref) => FirestoreBenefitsClubRepository(ref.watch(firestoreProvider)),
);

final benefitsClubServiceProvider = Provider<BenefitsClubService>(
  (ref) => CallableBenefitsClubService(),
);

/// Vive a sessão inteira do app: guarda o "já mandei o hub_card_view".
final benefitsClubTrackerProvider = Provider<BenefitsClubTracker>(
  (ref) => BenefitsClubTracker(ref.watch(benefitsClubServiceProvider)),
);

/// Uid da sessão; vazio deslogado (nada é lido: as rules exigem login).
final benefitsClubUidProvider = Provider.autoDispose<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid.trim() ?? '',
);

/// `appConfig/benefitsClub`; deslogado = desligado.
final benefitsClubConfigProvider =
    StreamProvider.autoDispose<BenefitsClubConfig>((ref) {
      if (ref.watch(benefitsClubUidProvider).isEmpty) {
        return Stream.value(BenefitsClubConfig.disabled);
      }
      return ref.watch(benefitsClubRepositoryProvider).watchConfig();
    });

/// Papel admin no token EM CACHE (o refresh dos claims é do pós-login).
final benefitsClubIsAdminProvider = FutureProvider.autoDispose<bool>((
  ref,
) async {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) return false;
  final token = await user.getIdTokenResult(false);
  return isAdminFromClaims(token.claims);
});

/// Quem testa (admin ou uid em `testerUids`). Carregando enquanto a flag ou o
/// token não chegaram; com erro em um deles, decide pelo que sobrou.
final benefitsClubTesterProvider = Provider.autoDispose<AsyncValue<bool>>((
  ref,
) {
  final uid = ref.watch(benefitsClubUidProvider);
  if (uid.isEmpty) return const AsyncData(false);
  final admin = ref.watch(benefitsClubIsAdminProvider);
  final config = ref.watch(benefitsClubConfigProvider);
  final adminValue = admin.valueOrNull;
  final configValue = config.valueOrNull;
  if ((adminValue == null && !admin.hasError) ||
      (configValue == null && !config.hasError)) {
    return const AsyncLoading();
  }
  return AsyncData(
    isTester(
      uid: uid,
      isAdmin: adminValue ?? false,
      config: configValue ?? BenefitsClubConfig.disabled,
    ),
  );
});

/// Card do Hub: só com a flag CARREGADA e ligada, ou para quem testa.
/// Carregando ou com erro = escondido (o Hub não pode pular nem quebrar).
final benefitsHubCardVisibleProvider = Provider.autoDispose<bool>((ref) {
  final config = ref.watch(benefitsClubConfigProvider).valueOrNull;
  if (config == null) return false;
  if (config.enabled) return true;
  final tester = ref.watch(benefitsClubTesterProvider).valueOrNull ?? false;
  return hubCardVisible(config, tester: tester);
});

/// Parceiros com `active == true` (o resto do filtro é do app).
final benefitsActivePartnersProvider =
    StreamProvider.autoDispose<List<Partner>>((ref) {
      if (ref.watch(benefitsClubUidProvider).isEmpty) {
        return Stream.value(const <Partner>[]);
      }
      return ref.watch(benefitsClubRepositoryProvider).watchActivePartners();
    });

/// Os parceiros que o atleta logado vê, já ordenados (público, cidade do
/// perfil, prioridade).
final benefitsVisiblePartnersProvider =
    Provider.autoDispose<AsyncValue<List<Partner>>>((ref) {
      final partners = ref.watch(benefitsActivePartnersProvider);
      final tester = ref.watch(benefitsClubTesterProvider);
      final profile = ref.watch(athleteProfileProvider);

      final list = partners.valueOrNull;
      if (list == null) {
        final error = partners.error;
        return error == null
            ? const AsyncLoading()
            : AsyncError(error, partners.stackTrace ?? StackTrace.current);
      }
      final isTesterValue = tester.valueOrNull;
      if (isTesterValue == null) return const AsyncLoading();
      // Sem o perfil não dá para saber a cidade: espera, para o parceiro de
      // cidade específica não aparecer depois dos outros.
      if (!profile.hasValue && !profile.hasError) return const AsyncLoading();

      return AsyncData(
        visiblePartners(
          list,
          tester: isTesterValue,
          athleteCity: profile.valueOrNull?.city,
        ),
      );
    });

/// Um parceiro visível para o atleta; `null` = não existe ou não é para ele.
final benefitsPartnerProvider = Provider.autoDispose
    .family<AsyncValue<Partner?>, String>(
      (ref, partnerId) => ref
          .watch(benefitsVisiblePartnersProvider)
          .whenData((visible) => partnerById(visible, partnerId)),
    );
