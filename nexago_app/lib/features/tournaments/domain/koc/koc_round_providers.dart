import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/nexago_artifacts_paths.dart';
import '../tournament_discovery_providers.dart';
import 'koc_board_logic.dart';
import 'koc_round_state.dart';

/// Estado ao vivo de uma rodada King of the Court, do doc de `matches`.
///
/// Stream própria, fora de `TournamentMatch`: aquele modelo é lido por dezenas
/// de telas de duelo e não deve carregar trono, fila e relógio. Quem precisa do
/// ao vivo — a mesa e o card do atleta — assina esta.
final kocRoundProvider = StreamProvider.autoDispose
    .family<KocRoundState?, String>((ref, matchId) {
  final id = matchId.trim();
  if (id.isEmpty) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection(NexagoArtifactsPaths.matchesCollection())
      .doc(id)
      .snapshots()
      .map((snap) {
        final data = snap.data();
        return data == null ? null : kocRoundStateFromMap(data);
      });
});

/// Nome curto de cada dupla do elenco da rodada, por `teamId`.
///
/// A rodada grava `teamAId`/`teamBId` vazios, então `FocusRosters` — que indexa
/// nomes pelos DOIS LADOS das partidas — nunca conhece o elenco KOTC e devolve
/// "A definir" para todo mundo. Este provider resolve pelos ids do elenco.
///
/// O `select` no elenco não é otimização prematura: `kocRoundProvider` emite a
/// cada rally, e sem ele a busca de nomes seria refeita dezenas de vezes por
/// rodada para um dado que não muda.
final kocRosterNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, String>((ref, matchId) async {
  final rosterKey = ref.watch(
    kocRoundProvider(matchId).select(
      (value) => (value.valueOrNull?.teamIds ?? const <String>[]).join('|'),
    ),
  );
  final ids = rosterKey.split('|').where((id) => id.isNotEmpty).toSet();
  if (ids.isEmpty) return const {};
  return ref
      .watch(tournamentMatchEnrichmentServiceProvider)
      .resolveTeamDisplayNames(ids);
});

/// A rodada da categoria que o telão deve exibir AGORA.
///
/// Existe por causa da operação real: numa quadra só, as 7 rodadas da etapa
/// acontecem em sequência. Um telão por rodada obrigaria alguém a trocar o link
/// sete vezes durante o dia, na frente do público. Este provider segue sozinho.
///
/// Precedência: em andamento → próxima agendada → última concluída.
final kocLiveRoundIdProvider = StreamProvider.autoDispose
    .family<String?, ({String tournamentId, String categoryId})>((ref, key) {
  final repo = ref.watch(tournamentMatchesRepositoryProvider);
  return repo
      .watchByTournament(key.tournamentId)
      .map((matches) => kocBoardRoundId(matches, key.categoryId));
});
