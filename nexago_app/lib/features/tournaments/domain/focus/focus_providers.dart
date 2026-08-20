import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/tournament_matches_repository.dart';
import '../athlete_tournament_day_providers.dart';
import '../tournament_match.dart';

/// Partidas do torneio em tempo real, a fonte única das quatro seções do Focus.
///
/// `family` por torneio: as seções leem o MESMO provider, então o Riverpod
/// mantém um listener só e trocar de seção não derruba e reabre a assinatura —
/// que é o problema que a casca do portal precisou resolver à mão com
/// `acquireLive`.
final focusMatchesProvider =
    StreamProvider.family<List<TournamentMatch>, String>((ref, tournamentId) {
  final repo = TournamentMatchesRepository(FirebaseFirestore.instance);
  return repo.watchByTournament(tournamentId);
});

/// A categoria em foco — a da próxima partida do atleta neste torneio.
///
/// Toda derivação de grupo depende dela: `poolId` só é único DENTRO da
/// categoria, e sem esse recorte o Grupo A do atleta vem fundido com o Grupo A
/// das outras categorias.
final focusCategoryIdProvider =
    Provider.family<String?, String>((ref, tournamentId) {
  final next = ref.watch(athleteNextMatchProvider).valueOrNull;
  if (next != null && next.tournamentId == tournamentId) {
    return next.match.categoryId;
  }
  return null;
});

/// O time do atleta na categoria em foco.
final focusMyTeamIdProvider =
    Provider.family<String?, String>((ref, tournamentId) {
  final next = ref.watch(athleteNextMatchProvider).valueOrNull;
  if (next == null || next.tournamentId != tournamentId) return null;
  return next.match.teamAId.isNotEmpty ? next.match.teamAId : null;
});

/// Chamada de quadra já reconhecida pelo atleta ("Ok, estou indo").
///
/// Mora aqui, e não no estado do widget da seção, porque precisa sobreviver à
/// troca de seção dentro da casca — trocar para Chave e voltar não pode fazer
/// o alerta vermelho reaparecer.
///
/// Só local: não existe callable para avisar a mesa que o atleta viu a chamada.
class FocusAcknowledgedCall extends Notifier<String?> {
  @override
  String? build() => null;

  void acknowledge(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    state = id;
  }
}

final focusAcknowledgedCallProvider =
    NotifierProvider<FocusAcknowledgedCall, String?>(FocusAcknowledgedCall.new);
