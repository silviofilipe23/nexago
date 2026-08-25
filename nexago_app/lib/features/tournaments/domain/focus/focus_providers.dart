import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/tournament_inscriptions_repository.dart';
import '../athlete_tournament_day_providers.dart';
import '../tournament_discovery_providers.dart';
import '../tournament_matches_logic.dart';
import 'focus_category_logic.dart';

/// NOTA: NÃO existe um `focusMatchesProvider` aqui de propósito.
///
/// A primeira versão criou um `StreamProvider.family` sobre
/// `watchByTournament` — e isso era um SEGUNDO listener na mesma coleção que
/// `tournamentMatchCardsProvider` (`tournament_discovery_providers.dart:66`) já
/// observa, com o enriquecimento de nomes e fotos por cima. As seções do Focus
/// leem aquele provider; o Riverpod compartilha a assinatura entre elas, que é
/// o que a casca do portal precisou montar à mão com `acquireLive`.

/// A categoria em foco neste torneio.
///
/// Toda derivação de grupo depende dela: `poolId` só é único DENTRO da
/// categoria, e sem esse recorte o Grupo A do atleta vem fundido com o Grupo A
/// das outras categorias. A nav também depende: é o `bracketFormat` DESTA
/// categoria que decide se a terceira aba é `GRUPO` ou `CHAVE`.
///
/// A escolha em si mora em [resolveFocusCategoryId], pura e testável. Aqui só
/// entram as famílias que a casca e as seções JÁ observam — o Riverpod
/// compartilha a assinatura, então isto não abre listener novo no Firestore
/// (vale a mesma NOTA do topo do arquivo).
final focusCategoryIdProvider =
    Provider.family<String?, String>((ref, tournamentId) {
  final next = ref.watch(athleteNextMatchProvider).valueOrNull;
  final fromNext =
      next != null && next.tournamentId == tournamentId ? next.match : null;

  // Atalho do dia de jogo. Sai ANTES de tocar nas partidas porque este provider
  // é reavaliado a cada emissão de `tournamentMatchCardsProvider` — ou seja, a
  // cada ponto marcado no torneio — e recortar/ordenar a lista inteira nessa
  // frequência seria trabalho jogado fora. (Quem depende daqui não reconstrói
  // por isso: `Provider` só notifica quando o VALOR muda, e o valor é um
  // `String?`.)
  final direct = fromNext?.categoryId.trim() ?? '';
  if (direct.isNotEmpty) return direct;

  final cards =
      ref.watch(tournamentMatchCardsProvider(tournamentId)).valueOrNull ??
          const [];
  final teamIdsByCategory = ref
          .watch(tournamentUserTeamIdsByCategoryProvider(tournamentId))
          .valueOrNull ??
      const <String, String>{};
  final offers = ref
          .watch(tournamentDetailProvider(tournamentId))
          .valueOrNull
          ?.categoryOffers ??
      const [];

  // A ordem das ofertas é a ordem em que o atleta vê as categorias no torneio;
  // o `where` mantém só aquelas em que ele está inscrito.
  final registered = teamIdsByCategory.keys.map((k) => k.trim()).toSet();
  final inOfferOrder = [
    for (final offer in offers)
      if (registered.contains(offer.id.trim())) offer.id.trim(),
  ];

  return resolveFocusCategoryId(
    nextMatchCategoryId: null,
    matches: [for (final c in cards) c.match],
    athleteTeamIds: athleteTeamIdsForHighlight(teamIdsByCategory),
    registeredCategoryIdsInOfferOrder: inOfferOrder,
  );
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
