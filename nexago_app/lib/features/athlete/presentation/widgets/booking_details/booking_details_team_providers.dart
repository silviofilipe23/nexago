import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/firebase/firebase_providers.dart';
import '../../../../../core/profiles/app_user_profile.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/booking_invite_status.dart';
import '../../../../arenas/domain/booking_providers.dart';
import '../../../../arenas/domain/my_booking_confirmed_athlete.dart';
import '../../../../arenas/domain/my_booking_item.dart';
import 'booking_details_view_model.dart';

class BookingDetailsTeamMember {
  const BookingDetailsTeamMember({
    required this.displayName,
    required this.subtitle,
    required this.initials,
    this.uid,
    this.avatarUrl,
    this.isOrganizer = false,
    this.isConfirmed = true,
    this.showPaidBadge = false,
    this.isEmptySlot = false,
    this.isViewer = false,
  });

  final String displayName;
  final String subtitle;
  final String initials;
  final String? uid;
  final String? avatarUrl;
  final bool isOrganizer;
  final bool isConfirmed;
  final bool showPaidBadge;
  final bool isEmptySlot;

  /// É quem está com a tela aberta (a linha mostra "Você").
  final bool isViewer;
}

class BookingDetailsTeamState {
  const BookingDetailsTeamState({
    required this.members,
    required this.confirmedCount,
    required this.totalSlots,
    this.viewerIsOwner = true,
    this.viewerIsParticipant = false,
    this.participantUids = const [],
    this.ownerUid,
  });

  final List<BookingDetailsTeamMember> members;
  final int confirmedCount;
  final int totalSlots;

  /// Quem abriu é o dono da reserva (pode convidar e remover).
  final bool viewerIsOwner;

  /// Quem abriu entrou por convite (pode sair do jogo).
  final bool viewerIsParticipant;

  /// Convidados gravados pelo servidor (`participantUids`): só esses saem
  /// pela callable — o legado `guestAthleteId` não.
  final List<String> participantUids;
  final String? ownerUid;

  int get openSlots => (totalSlots - confirmedCount).clamp(0, totalSlots);
}

final bookingDetailsTeamProvider = FutureProvider.autoDispose
    .family<BookingDetailsTeamState, String>((ref, bookingId) async {
  final id = bookingId.trim();
  if (id.isEmpty) {
    return const BookingDetailsTeamState(
      members: [],
      confirmedCount: 0,
      totalSlots: kBookingTeamSlots,
    );
  }

  final snap = await ref.watch(arenaBookingDocProvider(id).future);
  final data = snap?.data() ?? <String, dynamic>{};
  final user = ref.watch(authProvider).valueOrNull;
  final viewerUid = user?.uid;
  final ownerId = (data['ownerAthleteId'] as String?)?.trim() ??
      bookingOwnerUidOf(data) ??
      viewerUid;
  // Sem sessão, mantém a leitura antiga (a tela só abre logada).
  final viewerIsOwner = viewerUid == null || viewerUid == ownerId;
  final participantUids = bookingParticipantUidsOf(data);

  final participantsRaw = (data['confirmedParticipants'] as num?)?.toInt() ??
      (data['participantsConfirmedCount'] as num?)?.toInt() ??
      1;
  final confirmedCount = participantsRaw.clamp(1, kBookingTeamSlots);

  final ps = (data['paymentStatus'] as String?)?.toLowerCase().trim();
  final paidOnline = (data['amountPaidOnlineReais'] as num?)?.toDouble();
  final showPaid = bookingDetailsShowPaidBadge(
    paymentStatus: ps,
    paidOnline: paidOnline,
  );

  final members = <BookingDetailsTeamMember>[];

  // Dono: quem vê a própria reserva aparece como "Você"; o convidado vê o
  // nome de quem reservou.
  var organizerName = '';
  String? organizerAvatar;
  if (viewerIsOwner) {
    organizerName = user?.displayName?.trim() ?? '';
    if (user != null) {
      final profile = await ref.watch(athleteProfileProvider.future);
      if (profile != null) {
        final display = athleteDisplayName(profile, fallback: '');
        if (display.isNotEmpty) organizerName = display;
      }
      organizerAvatar = profile?.avatarUrl;
    }
  } else if (ownerId != null && ownerId.isNotEmpty) {
    final profile = await ref.watch(athleteProfileByIdProvider(ownerId).future);
    if (profile != null) {
      organizerName = athleteDisplayName(profile, fallback: '');
      organizerAvatar = profile.avatarUrl;
    }
  }
  if (organizerName.isEmpty) {
    organizerName = viewerIsOwner ? 'Você' : 'Quem reservou';
  }

  members.add(
    BookingDetailsTeamMember(
      uid: ownerId,
      displayName: viewerIsOwner ? 'Você' : organizerName,
      subtitle: 'organizador',
      initials: _initialsFrom(organizerName),
      avatarUrl: organizerAvatar,
      isOrganizer: true,
      isConfirmed: true,
      showPaidBadge: showPaid,
      isViewer: viewerIsOwner,
    ),
  );

  final guests = <MyBookingConfirmedAthlete>[];
  final seen = <String>{if (ownerId != null) ownerId};

  Future<void> addGuest(MyBookingConfirmedAthlete athlete) async {
    final uid = athlete.userId?.trim();
    if (uid != null && uid.isNotEmpty) {
      if (uid == ownerId || seen.contains(uid)) return;
      seen.add(uid);
    }
    var name = athlete.displayName?.trim() ?? '';
    String? avatar = athlete.avatarUrl;
    if (uid != null && uid.isNotEmpty) {
      final profile = await ref.watch(athleteProfileByIdProvider(uid).future);
      if (profile != null) {
        if (name.isEmpty) name = athleteDisplayName(profile, fallback: '');
        avatar ??= profile.avatarUrl;
      }
    }
    if (name.isEmpty) name = 'Jogador confirmado';
    guests.add(
      MyBookingConfirmedAthlete(
        userId: uid,
        displayName: name,
        avatarUrl: avatar,
      ),
    );
  }

  final parsed = MyBookingItem.parseConfirmedAthletesFromBooking(data);
  for (final athlete in parsed) {
    await addGuest(athlete);
  }

  // O documento antigo só guardava um par guestAthleteId/Name (convite do app
  // 1.0.1); a partir do 2º convidado aceito, completa a lista com os convites
  // aceitos em `bookingInvites`. Reservas novas trazem `participants`.
  if (guests.length < confirmedCount - 1) {
    final firestore = ref.watch(firestoreProvider);
    final invites = await firestore
        .collection('bookingInvites')
        .where('bookingId', isEqualTo: id)
        .where('status', isEqualTo: 'accepted')
        .limit(5)
        .get();
    for (final doc in invites.docs) {
      final acceptedBy = (doc.data()['acceptedByUid'] as String?)?.trim();
      if (acceptedBy != null && acceptedBy.isNotEmpty) {
        await addGuest(MyBookingConfirmedAthlete(userId: acceptedBy));
      }
    }
  }

  for (final guest in guests) {
    final name = guest.displayName?.trim() ?? 'Jogador confirmado';
    final isViewer = viewerUid != null && guest.userId == viewerUid;
    members.add(
      BookingDetailsTeamMember(
        uid: guest.userId,
        displayName: isViewer ? 'Você' : name,
        subtitle: 'Confirmado',
        initials: _initialsFrom(name),
        avatarUrl: guest.avatarUrl,
        isConfirmed: true,
        isViewer: isViewer,
      ),
    );
  }

  final emptySlots = kBookingTeamSlots - members.length;
  for (var i = 0; i < emptySlots; i++) {
    members.add(
      BookingDetailsTeamMember(
        displayName: 'Vaga aberta',
        subtitle: viewerIsOwner
            ? 'Convide alguém da sua rede'
            : 'Esperando mais gente',
        initials: '+',
        isEmptySlot: true,
        isConfirmed: false,
      ),
    );
  }

  return BookingDetailsTeamState(
    members: members,
    confirmedCount: confirmedCount,
    totalSlots: kBookingTeamSlots,
    viewerIsOwner: viewerIsOwner,
    viewerIsParticipant:
        viewerUid != null && participantUids.contains(viewerUid),
    participantUids: participantUids,
    ownerUid: ownerId,
  );
});

String _initialsFrom(String name) {
  return initialsFromDisplayName(name);
}
