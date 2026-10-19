import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../tournaments/data/partner_search_service.dart';
import 'booking_providers.dart';
import 'booking_result.dart';
import 'my_booking_confirmed_athlete.dart';
import 'my_booking_item.dart';

/// O que o story lê do documento da reserva: o esporte gravado e quem já
/// confirmou presença.
@immutable
class BookingStorySource {
  const BookingStorySource({
    this.sport,
    this.ownerUid,
    this.confirmed = const [],
  });

  final String? sport;
  final String? ownerUid;
  final List<MyBookingConfirmedAthlete> confirmed;
}

/// Lido do doc (e não dos args da confirmação) para valer também na reserva
/// PIX retomada, que mantém o esporte com que foi criada. `null` enquanto
/// carrega ou sem reserva.
final bookingStorySourceProvider =
    Provider.autoDispose.family<BookingStorySource?, String>((ref, bookingId) {
  final snap = ref.watch(arenaBookingDocProvider(bookingId)).valueOrNull;
  if (snap == null || !snap.exists) return null;
  final item = MyBookingItem.fromFirestore(snap);
  return BookingStorySource(
    sport: item.sport,
    ownerUid: item.ownerAthleteId,
    confirmed: item.confirmedAthletes,
  );
});

/// Atletas do app pelo nome ou @, para o "Adicionar dupla" do pós-jogo. Usa
/// a mesma busca do convite de dupla (mínimo de 3 letras, até 10 nomes).
final bookingResultPlayerSearchProvider = FutureProvider.autoDispose
    .family<List<ResultPlayer>, String>((ref, query) async {
  if (!isPartnerQueryLongEnough(query)) return const [];
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  final users = await ref.watch(partnerSearchServiceProvider).searchPartners(
        currentUserId: uid,
        categoryGenderType: null,
        query: query,
      );
  return [
    for (final u in users)
      ResultPlayer(
        id: u.uid,
        name: appUserDisplayName(u),
        avatarUrl: appUserProfilePhotoUrl(u),
      ),
  ];
});
