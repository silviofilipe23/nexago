import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/league_create/league_create_draft.dart';
import '../domain/league_create/league_create_logic.dart';
import '../domain/league_stage_create/league_stage_create_draft.dart';
import '../domain/league_stage_create/league_stage_create_logic.dart';
import '../domain/tournament_create/tournament_create_draft.dart';
import 'league_create_mapper.dart';
import 'league_stage_tournament_factory.dart';

typedef PublishedLeagueForStageAdd = ({
  String leagueId,
  String leagueName,
  int plannedStagesCount,
  TournamentSport sport,
  String city,
  String state,
  int defaultPriceCents,
  String rankingTableId,
  TournamentPaymentMode paymentMode,
  List<LeagueStageCategoryDraft> categories,
  List<LeagueStageDraft> existingStages,
});

class OrganizerLeaguesRepository {
  OrganizerLeaguesRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  static const _maxBatchWrites = 450;

  CollectionReference<Map<String, dynamic>> get _leagues =>
      _firestore.collection('leagues');

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  Stream<List<Map<String, dynamic>>> watchManagedLeagues(String managerId) {
    final uid = managerId.trim();
    if (uid.isEmpty) return Stream.value(const []);

    return _leagues
        .where('managerId', isEqualTo: uid)
        .orderBy('updatedAt', descending: true)
        .limit(20)
        .snapshots()
        .map(
          (snap) =>
              snap.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList(),
        );
  }

  Future<List<Map<String, dynamic>>> fetchManagedLeaguesFromServer(
    String managerId,
  ) async {
    final uid = managerId.trim();
    if (uid.isEmpty) return const [];

    final snap = await _leagues
        .where('managerId', isEqualTo: uid)
        .orderBy('updatedAt', descending: true)
        .limit(20)
        .get(const GetOptions(source: Source.server));

    return snap.docs
        .map((doc) => {'id': doc.id, ...doc.data()})
        .toList(growable: false);
  }

  Future<LeagueDraftLoadResult?> getLeagueDraft(String leagueId) async {
    final id = leagueId.trim();
    if (id.isEmpty) return null;

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final snap = await _leagues.doc(id).get();
    if (!snap.exists) return null;

    final data = snap.data();
    if (data == null) return null;

    if ((data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para acessar este rascunho.');
    }

    if (!_isDraftDocument(data)) {
      throw StateError('Esta liga não é um rascunho.');
    }

    return LeagueCreateMapper.fromFirestore(data, snap.id);
  }

  Future<({String leagueId, bool published})> saveLeague({
    required LeagueCreateDraft draft,
    required bool publish,
    LeagueCreateStep? wizardStep,
  }) async {
    if (publish) {
      return publishLeague(draft: draft, wizardStep: wizardStep);
    }
    return _saveLeagueDraftOnly(draft: draft, wizardStep: wizardStep);
  }

  Future<({String leagueId, bool published})> _saveLeagueDraftOnly({
    required LeagueCreateDraft draft,
    LeagueCreateStep? wizardStep,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    if (!canContinueFromLeagueStep(draft, LeagueCreateStep.identity)) {
      throw ArgumentError('Identidade da liga incompleta.');
    }

    final existingId = draft.leagueId?.trim();
    final isUpdate = existingId != null && existingId.isNotEmpty;
    final docRef = isUpdate ? _leagues.doc(existingId) : _leagues.doc();

    if (isUpdate) {
      final existing = await docRef.get();
      if (!existing.exists) {
        throw StateError('Rascunho não encontrado.');
      }
      final managerId = existing.data()?['managerId'] as String?;
      if (managerId != uid) {
        throw StateError('Sem permissão para atualizar esta liga.');
      }
    }

    final data = LeagueCreateMapper.toFirestore(
      draft: draft.copyWith(leagueId: isUpdate ? existingId : draft.leagueId),
      managerId: uid,
      publish: false,
      wizardStep: wizardStep ?? LeagueCreateStep.review,
      isUpdate: isUpdate,
    );

    if (isUpdate) {
      await docRef.update(data);
    } else {
      await docRef.set(data);
    }

    await _uploadCoverIfNeeded(
      leagueId: docRef.id,
      localPath: draft.coverImagePath,
    );

    return (leagueId: docRef.id, published: false);
  }

  /// Remove liga apenas se for rascunho do gestor autenticado.
  Future<void> deleteDraftLeague(String leagueId) async {
    final id = leagueId.trim();
    if (id.isEmpty) return;

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final snap = await _leagues
        .doc(id)
        .get(const GetOptions(source: Source.server));
    if (!snap.exists) return;

    final data = snap.data();
    if (data == null) return;

    if ((data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para excluir este rascunho.');
    }

    if (!_isDraftDocument(data)) {
      throw StateError('Somente rascunhos podem ser descartados.');
    }

    await _leagues.doc(id).delete();
    await _firestore.waitForPendingWrites();

    final verify = await _leagues
        .doc(id)
        .get(const GetOptions(source: Source.server));
    if (verify.exists) {
      throw StateError(
        'Não foi possível remover o rascunho. Verifique sua conexão e permissões.',
      );
    }
  }

  static bool _isDraftDocument(Map<String, dynamic> data) {
    for (final field in ['listingStatus', 'status']) {
      final raw = (data[field] as String?)?.trim().toLowerCase();
      if (raw == 'draft' || raw == 'rascunho') return true;
    }
    return false;
  }

  Future<({String leagueId, bool published})> publishLeague({
    required LeagueCreateDraft draft,
    LeagueCreateStep? wizardStep,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    if (!isValidLeagueForPublish(draft)) {
      throw ArgumentError('Dados da liga incompletos.');
    }

    final definedStages = draft.stages
        .where((s) => s.status == LeagueStageStatus.defined)
        .toList();
    if (definedStages.isEmpty) {
      throw ArgumentError(
        'Defina ao menos uma etapa antes de publicar o circuito.',
      );
    }
    final writeCount = 1 + definedStages.length;
    if (writeCount > _maxBatchWrites) {
      throw StateError('Muitas etapas para publicar de uma vez.');
    }

    final existingId = draft.leagueId?.trim();
    final isUpdate = existingId != null && existingId.isNotEmpty;
    final leagueRef = isUpdate ? _leagues.doc(existingId) : _leagues.doc();
    final leagueId = leagueRef.id;

    if (isUpdate) {
      final existing = await leagueRef.get();
      if (!existing.exists) {
        throw StateError('Rascunho não encontrado.');
      }
      if ((existing.data()?['managerId'] as String?) != uid) {
        throw StateError('Sem permissão para publicar esta liga.');
      }
    }

    final stageTournamentIds = <String, String>{};
    for (final stage in definedStages) {
      stageTournamentIds[stage.id] = _tournaments.doc().id;
    }

    final stagesWithIds = draft.stages
        .map((stage) {
          final tournamentId = stageTournamentIds[stage.id];
          if (tournamentId == null) return stage;
          return stage.copyWith(tournamentIds: [tournamentId]);
        })
        .toList(growable: false);

    final leagueDraft = draft.copyWith(
      leagueId: leagueId,
      stages: stagesWithIds,
    );

    final batch = _firestore.batch();

    batch.set(
      leagueRef,
      LeagueCreateMapper.toFirestore(
        draft: leagueDraft,
        managerId: uid,
        publish: true,
        wizardStep: wizardStep ?? LeagueCreateStep.review,
        isUpdate: isUpdate,
        stagesWithTournamentIds: stagesWithIds,
      ),
      SetOptions(merge: isUpdate),
    );

    for (final stage in definedStages) {
      final tournamentId = stageTournamentIds[stage.id]!;
      final tournamentRef = _tournaments.doc(tournamentId);
      batch.set(
        tournamentRef,
        LeagueStageTournamentFactory.build(
          league: leagueDraft,
          stage: stage,
          managerId: uid,
          tournamentId: tournamentId,
        ),
      );
    }

    await batch.commit();

    await _uploadCoverIfNeeded(
      leagueId: leagueId,
      localPath: draft.coverImagePath,
    );

    return (leagueId: leagueId, published: true);
  }

  Future<PublishedLeagueForStageAdd> getPublishedLeagueForStageAdd(
    String leagueId,
  ) async {
    final id = leagueId.trim();
    if (id.isEmpty) {
      throw ArgumentError('ID da liga inválido.');
    }

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final snap = await _leagues.doc(id).get();
    if (!snap.exists) {
      throw StateError('Liga não encontrada.');
    }

    final data = snap.data();
    if (data == null) {
      throw StateError('Liga não encontrada.');
    }

    if ((data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para gerenciar esta liga.');
    }

    final listingStatus = (data['listingStatus'] as String?) ?? '';
    if (listingStatus != 'open') {
      throw StateError('A liga precisa estar publicada para adicionar etapas.');
    }

    final defaultPrice =
        (data['defaultEntryFeeCents'] as num?)?.toInt() ?? 22000;
    final categoriesRaw = data['categories'];
    final categories = categoriesFromLeagueCategories(
      categoriesRaw is List ? categoriesRaw : const [],
      defaultPrice,
    );
    final existingStages = stagesFromLeagueData(data['stages'] as List?);

    return (
      leagueId: snap.id,
      leagueName: (data['name'] as String?) ?? 'Liga',
      plannedStagesCount:
          (data['plannedStagesCount'] as num?)?.toInt() ??
          existingStages.where((s) => !s.isGrandFinal).length,
      sport: _parseSport(data['sport'] as String?),
      city: (data['city'] as String?) ?? '',
      state: (data['state'] as String?) ?? '',
      defaultPriceCents: defaultPrice,
      rankingTableId: (data['rankingTableId'] as String?) ?? 'state_circuit',
      paymentMode: _parsePaymentMode(data['paymentMode'] as String?),
      categories: categories,
      existingStages: existingStages,
    );
  }

  Future<({String tournamentId, bool published})> saveStage({
    required LeagueStageCreateDraft draft,
    required bool publish,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    if (publish && !isValidStageForPublish(draft)) {
      throw ArgumentError('Dados da etapa incompletos.');
    }
    if (!canContinueFromStageStep(draft, LeagueStageCreateStep.location)) {
      throw ArgumentError('Local e datas incompletos.');
    }

    final leagueId = draft.leagueId.trim();
    if (leagueId.isEmpty) {
      throw ArgumentError('ID da liga inválido.');
    }

    final leagueRef = _leagues.doc(leagueId);
    final leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) {
      throw StateError('Liga não encontrada.');
    }
    final leagueData = leagueSnap.data();
    if (leagueData == null || (leagueData['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para atualizar esta liga.');
    }

    final leagueStatus = (leagueData['listingStatus'] as String?) ?? '';
    if (leagueStatus != 'open') {
      throw StateError('A liga precisa estar publicada para adicionar etapas.');
    }

    final existingStages = stagesFromLeagueData(leagueData['stages'] as List?);
    final tournamentId = _tournaments.doc().id;
    final definedStage = draft.stage.copyWith(
      status: LeagueStageStatus.defined,
      tournamentIds: [tournamentId],
    );

    final mergedStages =
        LeagueStageTournamentFactory.mergeStageIntoLeagueStages(
          existingStages: existingStages,
          updatedStage: definedStage,
        );

    final batch = _firestore.batch();
    final tournamentRef = _tournaments.doc(tournamentId);

    batch.set(
      tournamentRef,
      LeagueStageTournamentFactory.buildFromStageCreate(
        draft: draft,
        managerId: uid,
        tournamentId: tournamentId,
        publish: publish,
      ),
    );

    batch.update(leagueRef, {
      'stages': mergedStages,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return (tournamentId: tournamentId, published: publish);
  }

  Future<void> closeLeague(String leagueId) async {
    await _updateLeagueListingStatus(leagueId, 'closed');
  }

  Future<void> cancelLeague(String leagueId) async {
    await _updateLeagueListingStatus(leagueId, 'cancelled');
  }

  Future<void> _updateLeagueListingStatus(
    String leagueId,
    String listingStatus,
  ) async {
    final id = leagueId.trim();
    if (id.isEmpty) throw ArgumentError('ID da liga inválido.');

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final ref = _leagues.doc(id);
    final snap = await ref.get();
    if (!snap.exists) throw StateError('Liga não encontrada.');

    final data = snap.data();
    if (data == null || (data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para gerenciar esta liga.');
    }

    final current = (data['listingStatus'] as String?) ?? '';
    if (current == listingStatus) return;

    if (listingStatus == 'closed' && current != 'open') {
      throw StateError('Só é possível encerrar uma liga publicada.');
    }
    if (listingStatus == 'cancelled' &&
        current != 'open' &&
        current != 'draft') {
      throw StateError('Esta liga não pode ser cancelada.');
    }

    await ref.update({
      'listingStatus': listingStatus,
      'status': listingStatus,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  TournamentSport _parseSport(String? raw) {
    for (final value in TournamentSport.values) {
      if (value.name == raw) return value;
    }
    return TournamentSport.beachVolleyball;
  }

  TournamentPaymentMode _parsePaymentMode(String? raw) {
    for (final value in TournamentPaymentMode.values) {
      if (value.name == raw) return value;
    }
    return TournamentPaymentMode.appPixCard;
  }

  Future<void> _uploadCoverIfNeeded({
    required String leagueId,
    required String? localPath,
  }) async {
    if (localPath == null || localPath.isEmpty) return;

    final coverUrl = await uploadCover(
      leagueId: leagueId,
      localPath: localPath,
    );

    await _leagues.doc(leagueId).update({
      'coverUrl': coverUrl,
      'imageUrl': coverUrl,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<String> uploadCover({
    required String leagueId,
    required String localPath,
  }) async {
    final file = File(localPath);
    if (!file.existsSync()) {
      throw StateError('Imagem de capa não encontrada.');
    }
    final ref = FirebaseStorage.instance.ref().child(
      'leagues/$leagueId/cover.jpg',
    );
    await ref.putFile(file, SettableMetadata(contentType: 'image/jpeg'));
    return ref.getDownloadURL();
  }
}
