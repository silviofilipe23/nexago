import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/time/nexago_event_timezone.dart';

/// A chave da oferta do dia: o alvo só vale para o MESMO atleta no MESMO dia.
///
/// O dia é o do fuso do EVENTO, não o do aparelho: um atleta com o celular em
/// outro fuso, ou jogando às 22h, não pode receber a oferta duas vezes por
/// causa da virada em UTC.
String focusOfferKey(String uid, DateTime now) =>
    '$uid:${nexagoEventDayKey(now)}';

/// Trava da entrada automática no Modo Focus, EM MEMÓRIA — nunca em disco.
///
/// **O que ela resolve:** sem ela o atleta fica preso. O × devolve pra home, a
/// home resolve o alvo do dia de novo e empurra o Focus outra vez — sem saída
/// nenhuma dentro do app.
///
/// **Por que só em memória:** matar e reabrir o app é um gesto deliberado do
/// atleta e DEVE reoferecer o Focus — é o que "sempre abrir no dia de jogo"
/// quer dizer. Persistir isto mataria justamente esse caminho.
///
/// O custo conhecido é o cold start: se o sistema mata o app em segundo plano,
/// a próxima abertura reoferece. É o mesmo trade que o portal aceitou ao trocar
/// "silenciar até amanhã" por reoferecer a cada recarga de página.
///
/// Classe simples, não um `Notifier`: nada na UI precisa REAGIR à trava — ela é
/// consultada no instante da decisão e nada mais. Um Notifier só acrescentaria
/// um `state` que ninguém observa, e tornaria a lógica intestável fora de um
/// `ProviderContainer`.
class FocusDayOffer {
  String? _offeredKey;

  bool shouldOffer(String uid, DateTime now) {
    if (uid.trim().isEmpty) return false;
    return _offeredKey != focusOfferKey(uid, now);
  }

  void markOffered(String uid, DateTime now) {
    if (uid.trim().isEmpty) return;
    _offeredKey = focusOfferKey(uid, now);
  }
}

/// `keepAlive` de propósito: a trava tem que viver enquanto o PROCESSO viver.
/// Com `autoDispose`, sair do Focus descartaria a instância e a home
/// reofereceria na mesma sessão — o loop que a trava existe pra impedir.
final focusDayOfferProvider = Provider<FocusDayOffer>((ref) {
  ref.keepAlive();
  return FocusDayOffer();
});
