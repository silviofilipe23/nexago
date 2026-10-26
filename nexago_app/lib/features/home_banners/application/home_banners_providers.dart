import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../store/application/store_providers.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../domain/home_banner.dart';
import '../domain/home_banner_logic.dart';
import '../infrastructure/firestore_home_banners_repository.dart';

final homeBannersRepositoryProvider = Provider<HomeBannersRepository>((ref) {
  return FirestoreHomeBannersRepository(ref.watch(firestoreProvider));
});

final _homeBannerUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// Os banners publicados, na ordem do carrossel. Deslogado = nenhum (a rule
/// de `appConfig` exige sessão).
final homeBannersProvider = StreamProvider.autoDispose<List<HomeBanner>>((
  ref,
) {
  final uid = ref.watch(_homeBannerUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(homeBannersRepositoryProvider).watchBanners();
});

/// O que o atleta já fez com cada banner, por id.
final homeBannerMarksProvider =
    StreamProvider.autoDispose<Map<String, HomeBannerMarks>>((ref) {
  final uid = ref.watch(_homeBannerUidProvider);
  if (uid.isEmpty) return Stream.value(const {});
  return ref.watch(homeBannersRepositoryProvider).watchMarks(uid);
});

/// Escondidos nesta sessão (X, ou primeiro toque com "esconder depois") antes
/// de o Firestore devolver a marca — o card some no gesto, sem esperar a rede.
/// Zera na troca de conta.
final homeBannersHiddenProvider = StateProvider.autoDispose<Set<String>>((
  ref,
) {
  ref.watch(_homeBannerUidProvider);
  return const {};
});

/// O que ocupa o lugar do banner na Home deste atleta, ou `null` (o bloco
/// não aparece). Espera as marcas: sem elas um banner dispensado piscaria.
/// Reservas, inscrições e a Loja só são assinadas quando algum banner
/// depende delas.
final homeBannerSlotProvider = Provider.autoDispose<HomeBannerSlot?>((ref) {
  final banners = ref.watch(homeBannersProvider).valueOrNull;
  if (banners == null || banners.isEmpty) return null;
  final marks = ref.watch(homeBannerMarksProvider).valueOrNull;
  if (marks == null) return null;
  final hidden = ref.watch(homeBannersHiddenProvider);

  bool any(bool Function(HomeBanner b) test) => banners.any(test);
  final needsBookings = any(
    (b) =>
        b.audience == HomeBannerAudience.noBooking ||
        b.audience == HomeBannerAudience.booked,
  );
  final needsTournaments = any(
    (b) => b.audience == HomeBannerAudience.noTournament,
  );
  final needsStore = any((b) => b.destination == HomeBannerDestination.loja);

  final athlete = HomeBannerAthlete(
    accountCreatedAt:
        ref.watch(authProvider).valueOrNull?.metadata.creationTime,
    hasBookings: needsBookings
        ? ref.watch(myBookingsStreamProvider).valueOrNull?.isNotEmpty
        : null,
    hasTournaments: needsTournaments
        ? ref.watch(myTournamentRegistrationsProvider).valueOrNull?.isNotEmpty
        : null,
  );
  final storeOn = needsStore && ref.watch(storeEnabledProvider);

  return homeBannerSlot(
    eligibleHomeBanners(
      banners: [
        for (final b in banners)
          if (!hidden.contains(b.id)) b,
      ],
      marks: marks,
      athlete: athlete,
      now: DateTime.now(),
      destinationAvailable: (d) => d != HomeBannerDestination.loja || storeOn,
    ),
  );
});

final homeBannerTrackerProvider = Provider.autoDispose<HomeBannerTracker>((
  ref,
) {
  return HomeBannerTracker(ref);
});

/// Grava as marcas do atleta (viu, tocou, dispensou) — é delas que saem os
/// números do backoffice e o "dispensado não volta". Cada marca vai uma vez:
/// a rule recusa regravar, então confere as marcas lidas e o que já saiu
/// nesta sessão. Falha de rede é silenciosa: banner não é motivo de erro.
class HomeBannerTracker {
  HomeBannerTracker(this._ref);

  final Ref _ref;
  final _sent = <String>{};

  void mark(HomeBanner banner, HomeBannerMark mark) {
    final uid = _ref.read(_homeBannerUidProvider);
    final marks = _ref.read(homeBannerMarksProvider).valueOrNull;
    if (uid.isEmpty || marks == null) return;
    if (marks[banner.id]?.has(mark) ?? false) return;
    if (!_sent.add('${banner.id}:${mark.field}')) return;
    unawaited(
      _ref
          .read(homeBannersRepositoryProvider)
          .mark(uid, banner.id, mark)
          .catchError((Object _) {}),
    );
  }

  /// Tira o banner da Home já, antes de a marca voltar do Firestore.
  void hide(HomeBanner banner) {
    _ref
        .read(homeBannersHiddenProvider.notifier)
        .update((ids) => {...ids, banner.id});
  }
}
