import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../domain/athlete_tournament_day_logic.dart';
import '../../domain/athlete_tournament_day_providers.dart';
import '../../domain/focus/focus_day_offer.dart';

/// ENTRA no Modo Focus ao abrir o app no dia do torneio.
///
/// Entra, não oferece: o dono escolheu a opção mais agressiva, a mesma que o
/// portal do atleta já fazia. A folha "Entrar no Focus / Depois" que vivia aqui
/// foi removida — quem chega na arena não precisa de um passo a mais para ver o
/// que decide o dia dele.
///
/// **O gatilho é o dia do EVENTO, não "tem partida hoje"**
/// ([athleteFocusHomeTargetProvider]): inscrição paga em torneio rolando hoje e
/// atleta ainda vivo no mata-mata. Exigir partida do dia deixava o Focus fechado
/// justamente na hora em que ele mais serve — a manhã do primeiro dia, antes de
/// o organizador gerar a chave, quando ainda não existe partida nenhuma.
///
/// Mesmo desenho do [TournamentInviteAnnouncer], de propósito: é o padrão que
/// esta casca já usa para "agir uma vez ao entrar", com as mesmas duas guardas
/// que impedem atropelar um fluxo em andamento.
///
/// **Por que aqui e não no `redirect` global do router:** aquele redirect é
/// `async` e roda em TODA navegação — colocar a decisão lá faria o Focus brigar
/// com deep link e push.
///
/// **A trava** ([FocusDayOffer]) impede reentrar a cada rebuild da home: sem
/// ela o × devolve para a home, a home resolve o alvo do dia outra vez e empurra
/// o Focus de novo — o atleta não teria saída nenhuma dentro do app. Ela vive em
/// memória: matar e reabrir o app entra de novo, que é o comportamento certo
/// para quem fechou o app entre um jogo e outro.
class FocusDayAnnouncer extends ConsumerStatefulWidget {
  const FocusDayAnnouncer({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<FocusDayAnnouncer> createState() => _FocusDayAnnouncerState();
}

class _FocusDayAnnouncerState extends ConsumerState<FocusDayAnnouncer> {
  bool _opening = false;

  void _maybeEnter(AthleteFocusHomeTarget? target) {
    if (_opening || !mounted || target == null) return;

    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty) return;

    final offer = ref.read(focusDayOfferProvider);
    final now = DateTime.now();
    if (!offer.shouldOffer(uid, now)) return;

    _opening = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        _opening = false;
        return;
      }
      // Só entra com a casca do atleta à vista: se ele já está numa inscrição,
      // num pagamento ou num convite, abrir o Focus por cima tiraria o atleta
      // de um fluxo que ele começou de propósito.
      //
      // Isto ADIA a entrada, não a descarta: a trava não é marcada e o `build`
      // refaz a tentativa quando a rota de cima sai (ver lá embaixo).
      if (ModalRoute.of(context)?.isCurrent != true) {
        _opening = false;
        return;
      }
      offer.markOffered(uid, now);
      // O `await` vai até o atleta sair do Focus pelo ×. Liberar `_opening` só
      // então é o que impede uma segunda entrada enquanto ele está lá dentro —
      // e liberar de vez é obrigatório: quem responde "já entrou hoje" é a
      // trava, que é POR uid. Deixar `_opening` travado para sempre barraria o
      // próximo atleta a logar neste aparelho, que nunca foi oferecido hoje.
      await context.pushNamed(
        AppRouteNames.tournamentFocus,
        pathParameters: {'tournamentId': target.tournamentId},
      );
      if (mounted) _opening = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<AthleteFocusHomeTarget?>>(
      athleteFocusHomeTargetProvider,
      (previous, next) => _maybeEnter(next.valueOrNull),
    );

    final target = ref.watch(athleteFocusHomeTargetProvider).valueOrNull;

    // Ler a rota corrente AQUI, no build, não é uma checagem a mais:
    // `isCurrentOf` assina o `_ModalScopeStatus` da rota, e é essa assinatura
    // que faz o Flutter reconstruir este widget assim que a rota empilhada em
    // cima sai.
    final shellIsCurrent = ModalRoute.isCurrentOf(context) ?? false;

    // Esta linha carrega duas coisas, e as duas importam:
    //  1. o primeiro valor pode chegar antes do primeiro `listen` — sem ela,
    //     quem abre o app já no dia do torneio só entraria no Focus se o
    //     provider emitisse de novo;
    //  2. é a SEGUNDA CHANCE da entrada que perdeu a corrida do primeiro frame
    //     para os outros anúncios da casca (convite de dupla, missão diária,
    //     promoção de elo) — refeita com o alvo atual, não com o de antes.
    if (shellIsCurrent) _maybeEnter(target);

    return widget.child;
  }
}
