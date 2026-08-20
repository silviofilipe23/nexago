import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../athlete_tournament_day_providers.dart';

/// NOTA: NÃO existe um `focusMatchesProvider` aqui de propósito.
///
/// A primeira versão criou um `StreamProvider.family` sobre
/// `watchByTournament` — e isso era um SEGUNDO listener na mesma coleção que
/// `tournamentMatchCardsProvider` (`tournament_discovery_providers.dart:66`) já
/// observa, com o enriquecimento de nomes e fotos por cima. As seções do Focus
/// leem aquele provider; o Riverpod compartilha a assinatura entre elas, que é
/// o que a casca do portal precisou montar à mão com `acquireLive`.

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
