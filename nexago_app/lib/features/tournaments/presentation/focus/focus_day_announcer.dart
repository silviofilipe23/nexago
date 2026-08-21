import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../domain/athlete_tournament_day_logic.dart';
import '../../domain/athlete_tournament_day_providers.dart';
import '../../domain/focus/focus_day_offer.dart';
import 'focus_invite_sheet.dart';

/// OFERECE o Modo Focus ao entrar no app no dia de jogo.
///
/// Oferece, não empurra: os protótipos trocaram o redirect automático por uma
/// folha com "Entrar no Focus" e "Depois". Quem abriu o app para reservar
/// quadra ou ver ranking não tem a navegação sequestrada, e quem vai jogar
/// continua sem depender de descobrir o Focus sozinho.
///
/// Mesmo desenho do [TournamentInviteAnnouncer], de propósito: é o padrão que
/// esta casca já usa para "anunciar algo uma vez ao entrar", com as mesmas duas
/// guardas que impedem empilhar tela por cima de um fluxo em andamento.
///
/// **Por que aqui e não no `redirect` global do router:** aquele redirect é
/// `async` e roda em TODA navegação — colocar a decisão lá faria o Focus brigar
/// com deep link e push.
///
/// **A trava** ([FocusDayOffer]) impede reoferecer a cada rebuild da home. Ela
/// vive em memória: matar e reabrir o app oferece de novo, que é o
/// comportamento certo para quem fechou o app entre um jogo e outro.
class FocusDayAnnouncer extends ConsumerStatefulWidget {
  const FocusDayAnnouncer({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<FocusDayAnnouncer> createState() => _FocusDayAnnouncerState();
}

class _FocusDayAnnouncerState extends ConsumerState<FocusDayAnnouncer> {
  bool _opening = false;

  void _maybeOffer(AthleteNextMatch? target) {
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
      // Só oferece com a casca do atleta à vista: se ele já está numa
      // inscrição, num pagamento ou num convite, abrir a folha por cima
      // interromperia um fluxo que ele começou de propósito.
      //
      // Isto ADIA a oferta, não a descarta: a trava não é marcada e o `build`
      // refaz a tentativa quando a rota de cima sai (ver lá embaixo).
      if (ModalRoute.of(context)?.isCurrent != true) {
        _opening = false;
        return;
      }
      offer.markOffered(uid, now);
      await showFocusInviteSheet(context, target: target);
      if (mounted) _opening = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<AthleteNextMatch?>>(
      athleteNextMatchProvider,
      (previous, next) => _maybeOffer(next.valueOrNull),
    );

    final target = ref.watch(athleteNextMatchProvider).valueOrNull;

    // Ler a rota corrente AQUI, no build, não é uma checagem a mais:
    // `isCurrentOf` assina o `_ModalScopeStatus` da rota, e é essa assinatura
    // que faz o Flutter reconstruir este widget assim que a rota empilhada em
    // cima sai.
    final shellIsCurrent = ModalRoute.isCurrentOf(context) ?? false;

    // Esta linha carrega duas coisas, e as duas importam:
    //  1. o primeiro valor pode chegar antes do primeiro `listen` — sem ela,
    //     quem abre o app já com partida hoje só entraria no Focus se o
    //     provider emitisse de novo;
    //  2. é a SEGUNDA CHANCE da oferta que perdeu a corrida do primeiro frame
    //     para os outros anúncios da casca (convite de dupla, missão diária,
    //     promoção de elo) — refeita com o alvo atual, não com o de antes.
    if (shellIsCurrent) _maybeOffer(target);

    return widget.child;
  }
}
