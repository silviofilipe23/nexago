import 'package:cloud_firestore/cloud_firestore.dart';

import '../../organizer/data/match_point_write.dart';
import '../domain/tournament_match.dart';
import '../domain/tournament_match_point_event.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_match_mapper.dart';
import 'tournament_match_point_event_mapper.dart';

/// Lê partidas em `artifacts/.../matches` filtradas por `tournamentId`.
///
/// Índice recomendado: `tournamentId` (ver `firestore.indexes.json` no volley-track-app).
class TournamentMatchesRepository {
  TournamentMatchesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _matches =>
      _firestore.collection(NexagoArtifactsPaths.matchesCollection());

  Stream<List<TournamentMatch>> watchByTournament(String tournamentId) {
    if (tournamentId.isEmpty) return Stream.value(const []);

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .snapshots()
        .map(_mapAndSort);
  }

  Stream<List<TournamentMatch>> watchByTournamentAndDay(
    String tournamentId,
    String dayKey,
  ) {
    if (tournamentId.isEmpty) return Stream.value(const []);
    if (dayKey.trim().isEmpty) return watchByTournament(tournamentId);

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .where('dayKey', isEqualTo: dayKey.trim())
        .snapshots()
        .map(_mapAndSort);
  }

  Stream<List<TournamentMatch>> watchByCategory(
    String tournamentId,
    String categoryName,
  ) {
    if (tournamentId.isEmpty || categoryName.isEmpty) {
      return Stream.value(const []);
    }

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .where('categoryId', isEqualTo: categoryName)
        .snapshots()
        .map(_mapAndSort);
  }

  Future<TournamentMatch?> getById(String matchId) async {
    if (matchId.trim().isEmpty) return null;
    final snap = await _matches.doc(matchId).get();
    return TournamentMatchMapper.fromSnapshot(snap);
  }

  Future<List<TournamentMatch>> getByTournamentId(String tournamentId) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return const [];

    final snap = await _matches.where('tournamentId', isEqualTo: tid).get();
    return _mapAndSort(snap);
  }

  Stream<TournamentMatch?> watchById(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _matches
        .doc(id)
        .snapshots()
        .map(TournamentMatchMapper.fromSnapshot);
  }

  CollectionReference<Map<String, dynamic>> _pointEventsRef(String matchId) {
    return _firestore.collection(
      NexagoArtifactsPaths.matchPointEventsCollection(matchId),
    );
  }

  Future<List<TournamentMatchPointEvent>> getPointEvents(String matchId) async {
    final id = matchId.trim();
    if (id.isEmpty) return const [];

    final snap = await _pointEventsRef(id).orderBy('seq').get();
    return _mapPointEvents(snap.docs);
  }

  Stream<List<TournamentMatchPointEvent>> watchPointEvents(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _pointEventsRef(id)
        .orderBy('seq')
        .snapshots()
        .map((snap) => _mapPointEvents(snap.docs));
  }

  List<TournamentMatchPointEvent> _mapPointEvents(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    return docs
        .map(TournamentMatchPointEventMapper.fromSnapshot)
        .whereType<TournamentMatchPointEvent>()
        .toList(growable: false);
  }

  /// Transação atômica: atualiza placar + append pointEvent.
  /// Atualiza o doc da partida e grava o evento com `seq = pointEventSeq + 1` no MESMO commit —
  /// as rules validam a sequência, então duas mesas concorrentes não gravam o mesmo seq.
  ///
  /// O placar é montado AQUI DENTRO, pelo [build], sobre o doc que a transação acabou de ler — e
  /// nunca a partir do que a tela tem em mãos. Transação do Firestore não tem latency
  /// compensation: o commit não aparece no cache local, e o listener só recebe a versão nova
  /// quando a stream entrega, o que acontece DEPOIS deste `await` retornar. Montando o payload
  /// na tela, dois toques dentro dessa janela partiam do mesmo placar e gravavam o mesmo
  /// `scoreA`/`scoreB` — o segundo ainda sobrescrevia `sets` com o valor antigo, então o ponto
  /// se perdia de verdade (não era só evento repetido na timeline). Lendo aqui, o controle
  /// otimista do Firestore fecha o resto: se o doc mudar entre a leitura e o commit, a transação
  /// REPETE o [build] sobre o estado novo.
  ///
  /// Espelha `recordPointTransaction` de `live-match-repository.ts` (mesas web).
  Future<MatchPointWrite?> recordPointTransaction({
    required String matchId,
    required MatchPointWrite? Function(TournamentMatch match) build,
  }) async {
    final id = matchId.trim();
    if (id.isEmpty) return null;

    MatchPointWrite? written;
    await _firestore.runTransaction((txn) async {
      final matchRef = _matches.doc(id);
      final matchSnap = await txn.get(matchRef);
      final data = matchSnap.data();
      if (!matchSnap.exists || data == null) {
        throw StateError('Partida não encontrada');
      }

      // Reatribuído a cada retry da transação: vale o da última passada.
      written = build(TournamentMatchMapper.fromMap(matchSnap.id, data));
      final write = written;
      if (write == null) return;

      final nextSeq = ((data['pointEventSeq'] as num?)?.toInt() ?? 0) + 1;
      final eventRef = _pointEventsRef(id).doc();
      txn.update(matchRef, {
        ...write.matchUpdate,
        'pointEventSeq': nextSeq,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      txn.set(eventRef, {
        ...write.pointEvent,
        'seq': nextSeq,
        'ts': FieldValue.serverTimestamp(),
      });
    });

    return written;
  }

  Future<void> updateMatchFields({
    required String matchId,
    required Map<String, dynamic> fields,
  }) async {
    final id = matchId.trim();
    if (id.isEmpty || fields.isEmpty) return;

    await _matches.doc(id).update({
      ...fields,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<List<Map<String, dynamic>>> watchAuditLog(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection(NexagoArtifactsPaths.matchAuditLogCollection(id))
        .orderBy('at', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
  }

  Future<List<TournamentMatch>> getByTeamId(String teamId) async {
    if (teamId.trim().isEmpty) return [];

    final results = await Future.wait([
      _matches.where('teamAId', isEqualTo: teamId).get(),
      _matches.where('teamBId', isEqualTo: teamId).get(),
    ]);

    final byId = <String, TournamentMatch>{};
    for (final snap in results) {
      for (final doc in snap.docs) {
        final match = TournamentMatchMapper.fromSnapshot(doc);
        if (match != null) byId[match.id] = match;
      }
    }
    return _sortMatches(byId.values.toList());
  }

  Future<List<TournamentMatch>> getByTeamIds(Iterable<String> teamIds) async {
    final ids = teamIds.where((id) => id.trim().isNotEmpty).toSet();
    if (ids.isEmpty) return [];

    final byId = <String, TournamentMatch>{};
    final batches = await Future.wait(ids.map(getByTeamId));
    for (final list in batches) {
      for (final match in list) {
        byId[match.id] = match;
      }
    }
    return _sortMatches(byId.values.toList());
  }

  List<TournamentMatch> _mapAndSort(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) {
    final items = snap.docs
        .map(TournamentMatchMapper.fromSnapshot)
        .whereType<TournamentMatch>()
        .toList();
    return _sortMatches(items);
  }

  List<TournamentMatch> _sortMatches(List<TournamentMatch> items) {
    items.sort((a, b) {
      final c = a.categoryId.compareTo(b.categoryId);
      if (c != 0) return c;
      // matchNumber já é a numeração GLOBAL cronológica — não usar `round`
      // como desempate: em dupla eliminação, WB/LB/3º lugar/final reiniciam o
      // round cada um na sua chave (ver ScheduleLogic.buildDaySchedule).
      return a.matchNumber.compareTo(b.matchNumber);
    });
    return items;
  }
}
