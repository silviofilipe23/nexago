import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_listing_status.dart';
import '../domain/tournament_payment_mode.dart';
import '../domain/tournament_uniform_selection.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_detail_lookup.dart';

class MyTournamentRegistrationsRepository {
  MyTournamentRegistrationsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Stream<List<MyTournamentRegistration>> watchForUser(String uid) {
    if (uid.isEmpty) return Stream.value(const []);

    final indexed = _inscriptions
        .where('participantUids', arrayContains: uid)
        .snapshots()
        .asyncMap((snap) => _mapIndexedRegistrations(snap, uid));

    final legacyFuture = _loadLegacyRegistrations(uid);

    return indexed.asyncMap((indexedRows) async {
      final legacyRows = await legacyFuture;
      final byId = <String, MyTournamentRegistration>{
        for (final row in indexedRows) row.registrationId: row,
        for (final row in legacyRows) row.registrationId: row,
      };
      final merged = byId.values.toList()
        ..sort((a, b) => a.tournamentName.compareTo(b.tournamentName));
      return merged;
    });
  }

  Future<List<MyTournamentRegistration>> _loadLegacyRegistrations(
    String uid,
  ) async {
    final teamIds = <String>{};
    final player1Snap = await _teams.where('player1Id', isEqualTo: uid).get();
    final player2Snap = await _teams.where('player2Id', isEqualTo: uid).get();
    for (final doc in player1Snap.docs) {
      teamIds.add(doc.id);
    }
    for (final doc in player2Snap.docs) {
      teamIds.add(doc.id);
    }
    if (teamIds.isEmpty) return const [];

    final legacyDocs = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    final ids = teamIds.toList();
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, min(i + 30, ids.length));
      final snap = await _inscriptions.where('teamId', whereIn: chunk).get();
      for (final doc in snap.docs) {
        final data = doc.data();
        final uids = data['participantUids'];
        if (uids is List && uids.isNotEmpty) continue;
        legacyDocs.add(doc);
      }
    }

    return _mapRegistrationDocs(legacyDocs, uid);
  }

  Future<List<MyTournamentRegistration>> _mapIndexedRegistrations(
    QuerySnapshot<Map<String, dynamic>> snap,
    String uid,
  ) {
    return _mapRegistrationDocs(snap.docs, uid);
  }

  Future<List<MyTournamentRegistration>> _mapRegistrationDocs(
    Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
    String uid,
  ) async {
    final results = <MyTournamentRegistration>[];

    for (final doc in docs) {
      final data = doc.data();
      // Inscrição solo aguardando parceiro (`registerSoloTournament`) não
      // tem `teams` doc nem `teamId` até o convite ser aceito — ainda assim
      // é uma inscrição ativa e deve aparecer em "Meus torneios"/Início.
      final teamIdRaw = (data['teamId'] as String?)?.trim() ?? '';
      final teamId = teamIdRaw.isEmpty ? null : teamIdRaw;

      final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
      if (tournamentId.isEmpty) continue;

      final tournament = await _loadTournamentDetail(tournamentId);
      final isPaid = data['isPaid'] == true;
      final isWaitlist = data['waitlist'] == true;
      final categoryId = data['categoryId'] as String? ?? '';
      final listingRaw = tournament?.listingStatusRaw;
      final sharePaidUids = _sharePaidUidsFromData(data);
      final athleteHasReserved = sharePaidUids.contains(uid);
      final teamSizeRaw = data['teamSize'];

      results.add(
        MyTournamentRegistration(
          registrationId: doc.id,
          tournamentId: tournamentId,
          tournamentName: tournament?.name ?? 'Torneio',
          dateLabel: tournament?.dateLabel ?? '',
          statusLabel: athleteRegistrationStatusLabel(
            isPaid: isPaid,
            isWaitlist: isWaitlist,
            athleteHasReserved: athleteHasReserved,
          ),
          isPaid: isPaid,
          categoryId: categoryId,
          startDate: tournament?.startDate,
          endDate: tournament?.endDate,
          listingStatus: tournament?.status,
          listingStatusRaw: listingRaw,
          teamId: teamId,
          locationLine: _tournamentLocationLine(tournament),
          isWaitlist: isWaitlist,
          athleteHasReserved: athleteHasReserved,
          partnerPending: data['partnerPending'] == true,
          hasPartialPayment: sharePaidUids.isNotEmpty,
          participantUids: _stringListFromData(data['participantUids']),
          player1Id: (data['player1Id'] as String?)?.trim().isNotEmpty == true
              ? (data['player1Id'] as String).trim()
              : null,
          teamSize: teamSizeRaw is num ? teamSizeRaw.toInt() : null,
          teamName: (data['teamName'] as String?)?.trim().isNotEmpty == true
              ? (data['teamName'] as String).trim()
              : null,
          uniformPlayer1: uniformSelectionFromRegistrationDoc(data, 1),
          uniformPlayer2: uniformSelectionFromRegistrationDoc(data, 2),
          uniformByUid: _uniformByUidFromData(data['uniformByUid']),
          category: _resolveCategory(tournament, categoryId),
          paymentMode:
              tournament?.paymentMode ?? TournamentPaymentMode.appPixCard,
          tournamentIsCancelled: isCancelledListing(listingRaw),
          captainUid: (data['captainUid'] as String?)?.trim().isNotEmpty == true
              ? (data['captainUid'] as String).trim()
              : null,
          substitutionHistory: _substitutionHistoryFromData(data['substitutionHistory']),
        ),
      );
    }

    return results;
  }

  static List<String> _sharePaidUidsFromData(Map<String, dynamic> data) {
    return _stringListFromData(data['sharePaidUids']);
  }

  static List<RegistrationSubstitutionEntry> _substitutionHistoryFromData(
    dynamic raw,
  ) {
    if (raw is! List) return const [];
    final out = <RegistrationSubstitutionEntry>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final at = item['at'];
      out.add(RegistrationSubstitutionEntry(
        outName: (item['outName'] as String?)?.trim() ?? 'Atleta',
        inName: (item['inName'] as String?)?.trim() ?? 'Atleta',
        at: at is Timestamp ? at.toDate() : null,
      ));
    }
    return out;
  }

  static List<String> _stringListFromData(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toList();
  }

  /// Slot de uniforme no formato do doc (`{sizeTop, sizeShorts, jerseyNumber,
  /// jerseyName}`); `null` quando o campo não existe ou não é um mapa.
  static TournamentUniformSelection? _uniformFromData(dynamic raw) {
    if (raw is! Map) return null;
    final number = raw['jerseyNumber'];
    return TournamentUniformSelection(
      sizeTop: (raw['sizeTop'] as String?)?.trim(),
      sizeShorts: (raw['sizeShorts'] as String?)?.trim(),
      jerseyNumber: number is num ? number.toInt() : null,
      jerseyName: (raw['jerseyName'] as String?)?.trim(),
    );
  }

  static Map<String, TournamentUniformSelection> _uniformByUidFromData(
    dynamic raw,
  ) {
    if (raw is! Map) return const {};
    final result = <String, TournamentUniformSelection>{};
    for (final entry in raw.entries) {
      final uid = entry.key;
      if (uid is! String || uid.trim().isEmpty) continue;
      final slot = _uniformFromData(entry.value);
      if (slot != null) result[uid.trim()] = slot;
    }
    return result;
  }

  /// `categories[].id` primeiro; doc legado guarda o nome no `categoryId`.
  static TournamentCategoryOffer? _resolveCategory(
    TournamentDetail? tournament,
    String categoryId,
  ) {
    final offers = tournament?.categoryOffers;
    if (offers == null || categoryId.trim().isEmpty) return null;
    for (final offer in offers) {
      if (offer.id == categoryId) return offer;
    }
    for (final offer in offers) {
      if (offer.name == categoryId) return offer;
    }
    return null;
  }

  static String? _tournamentLocationLine(TournamentDetail? tournament) {
    if (tournament == null) return null;
    final parts = <String>[];
    final loc = tournament.location.trim();
    final city = tournament.city.trim();
    if (loc.isNotEmpty) parts.add(loc);
    if (city.isNotEmpty) parts.add(city);
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }

  Future<TournamentDetail?> _loadTournamentDetail(String id) {
    return loadTournamentDetailById(_firestore, id);
  }
}

final myTournamentRegistrationsRepositoryProvider =
    Provider<MyTournamentRegistrationsRepository>((ref) {
  return MyTournamentRegistrationsRepository(FirebaseFirestore.instance);
});

final myTournamentRegistrationsProvider =
    StreamProvider.autoDispose<List<MyTournamentRegistration>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(myTournamentRegistrationsRepositoryProvider)
      .watchForUser(uid);
});
