import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/tournament_create/tournament_create_draft.dart';
import '../domain/tournament_create/tournament_create_logic.dart';
import 'tournament_create_mapper.dart';

typedef TournamentDraftLoadResult = ({
  TournamentCreateDraft draft,
  TournamentCreateStep step,
});

class OrganizerTournamentsRepository {
  OrganizerTournamentsRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  Stream<List<Map<String, dynamic>>> watchManagedTournaments(String managerId) {
    final uid = managerId.trim();
    if (uid.isEmpty) return Stream.value(const []);

    return _tournaments
        .where('managerId', isEqualTo: uid)
        .orderBy('updatedAt', descending: true)
        .limit(20)
        .snapshots()
        .map(
          (snap) => snap.docs
              .map(
                (doc) => {
                  'id': doc.id,
                  ...doc.data(),
                },
              )
              .toList(),
        );
  }

  /// Leitura pontual no servidor (evita cache do stream ao descartar rascunhos).
  Future<List<Map<String, dynamic>>> fetchManagedTournamentsFromServer(
    String managerId,
  ) async {
    final uid = managerId.trim();
    if (uid.isEmpty) return const [];

    final snap = await _tournaments
        .where('managerId', isEqualTo: uid)
        .orderBy('updatedAt', descending: true)
        .limit(20)
        .get(const GetOptions(source: Source.server));

    return snap.docs
        .map((doc) => {'id': doc.id, ...doc.data()})
        .toList(growable: false);
  }

  Future<TournamentDraftLoadResult?> getTournamentDraft(String tournamentId) async {
    final id = tournamentId.trim();
    if (id.isEmpty) return null;

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final snap = await _tournaments.doc(id).get();
    if (!snap.exists) return null;

    final data = snap.data();
    if (data == null) return null;

    if ((data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para acessar este rascunho.');
    }

    if (!isDraftDocument(data)) {
      throw StateError('Este torneio não é um rascunho.');
    }

    final parsed = TournamentCreateMapper.fromFirestore(data, snap.id);
    final step = parsed.wizardStep ?? inferResumeStep(parsed.draft);
    return (draft: parsed.draft, step: step);
  }

  Future<({String tournamentId, bool published})> saveTournament({
    required TournamentCreateDraft draft,
    required bool publish,
    TournamentCreateStep? wizardStep,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    if (!isValidForPublish(draft) && publish) {
      throw ArgumentError('Dados do torneio incompletos.');
    }
    if (!canContinueFromStep(draft, TournamentCreateStep.identity)) {
      throw ArgumentError('Identidade do torneio incompleta.');
    }

    final existingId = draft.tournamentId?.trim();
    final isUpdate = existingId != null && existingId.isNotEmpty;
    final docRef = isUpdate ? _tournaments.doc(existingId) : _tournaments.doc();

    String? existingListingStatus;
    if (isUpdate) {
      final existing = await docRef.get();
      if (!existing.exists) {
        throw StateError('Rascunho não encontrado.');
      }
      final existingData = existing.data();
      final managerId = existingData?['managerId'] as String?;
      if (managerId != uid) {
        throw StateError('Sem permissão para atualizar este torneio.');
      }
      existingListingStatus = existingData?['listingStatus'] as String?;
    }

    final data = TournamentCreateMapper.toFirestore(
      draft: draft.copyWith(tournamentId: isUpdate ? existingId : draft.tournamentId),
      managerId: uid,
      publish: publish,
      wizardStep: wizardStep ?? TournamentCreateStep.review,
      isUpdate: isUpdate,
      existingListingStatus: existingListingStatus,
    );

    if (isUpdate) {
      await docRef.update(data);
    } else {
      await docRef.set(data);
    }

    var coverUrl = data['coverUrl'] as String?;
    var regulationPdfUrl = data['regulationPdfUrl'] as String?;

    if (draft.coverImagePath != null && draft.coverImagePath!.isNotEmpty) {
      coverUrl = await uploadCover(
        tournamentId: docRef.id,
        localPath: draft.coverImagePath!,
      );
    } else if (draft.coverImageUrl != null && draft.coverImageUrl!.isNotEmpty) {
      coverUrl = draft.coverImageUrl;
    }

    if (draft.regulationPdfPath != null &&
        draft.regulationPdfPath!.isNotEmpty) {
      regulationPdfUrl = await uploadRegulationPdf(
        tournamentId: docRef.id,
        localPath: draft.regulationPdfPath!,
      );
    }

    if (coverUrl != null || regulationPdfUrl != null) {
      await docRef.update({
        if (coverUrl != null) ...{
          'coverUrl': coverUrl,
          'imageUrl': coverUrl,
        },
        if (regulationPdfUrl != null)
          'regulationPdfUrl': regulationPdfUrl,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }

    final listingStatus = data['listingStatus'] as String? ?? 'draft';
    return (
      tournamentId: docRef.id,
      published: listingStatus == 'open',
    );
  }

  /// Remove torneio apenas se for rascunho do gestor autenticado.
  Future<void> deleteDraftTournament(String tournamentId) async {
    final id = tournamentId.trim();
    if (id.isEmpty) return;

    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final snap = await _tournaments
        .doc(id)
        .get(const GetOptions(source: Source.server));
    if (!snap.exists) return;

    final data = snap.data();
    if (data == null) return;

    if ((data['managerId'] as String?) != uid) {
      throw StateError('Sem permissão para excluir este rascunho.');
    }

    if (!isDraftDocument(data)) {
      throw StateError('Somente rascunhos podem ser descartados.');
    }

    await _tournaments.doc(id).delete();
    await _firestore.waitForPendingWrites();

    final verify = await _tournaments
        .doc(id)
        .get(const GetOptions(source: Source.server));
    if (verify.exists) {
      throw StateError(
        'Não foi possível remover o rascunho. Verifique sua conexão e permissões.',
      );
    }
  }

  static bool isDraftDocument(Map<String, dynamic> data) {
    for (final field in ['listingStatus', 'status']) {
      final raw = (data[field] as String?)?.trim().toLowerCase();
      if (raw == 'draft' || raw == 'rascunho') return true;
    }
    return false;
  }

  Future<String> uploadCover({
    required String tournamentId,
    required String localPath,
  }) async {
    final file = File(localPath);
    if (!file.existsSync()) {
      throw StateError('Imagem de capa não encontrada.');
    }
    final ref = FirebaseStorage.instance
        .ref()
        .child('tournaments/$tournamentId/cover.jpg');
    await ref.putFile(file, SettableMetadata(contentType: 'image/jpeg'));
    return ref.getDownloadURL();
  }

  Future<String> uploadRegulationPdf({
    required String tournamentId,
    required String localPath,
  }) async {
    final file = File(localPath);
    if (!file.existsSync()) {
      throw StateError('PDF do regulamento não encontrado.');
    }
    final ref = FirebaseStorage.instance
        .ref()
        .child('tournaments/$tournamentId/regulamento.pdf');
    await ref.putFile(file, SettableMetadata(contentType: 'application/pdf'));
    return ref.getDownloadURL();
  }
}
