import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../domain/arena_contact_message.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_booking_success_actions.dart';

/// Clique em "Entre em contato" numa arena pré-cadastrada.
///
/// Duas coisas acontecem, nesta ordem de prioridade: abrir o WhatsApp para o
/// atleta e registrar o clique para o comercial. Se o registro falhar (offline,
/// function fora do ar), o WhatsApp abre do mesmo jeito — perder a métrica é
/// aceitável, travar o atleta na frente do contato da arena não é.
class ArenaContactService {
  ArenaContactService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  /// URL `wa.me` já com a mensagem, ou `null` se a arena não tem WhatsApp
  /// utilizável — nesse caso o botão nem deve ser exibido.
  static String? whatsAppUrlFor(ArenaListItem arena) {
    return ArenaBookingSuccessActions.buildWhatsAppUrl(
      phone: arena.whatsapp ?? arena.phone,
      message: buildArenaContactWhatsAppMessage(arenaName: arena.name),
    );
  }

  /// Registra o clique. Nunca lança: o chamador já está abrindo o WhatsApp.
  Future<void> trackContactClick(String arenaId) async {
    try {
      await _functions.httpsCallable('trackArenaContactClick').call<void>({
        'arenaId': arenaId,
        'surface': 'app',
      });
    } catch (error, stack) {
      debugPrint('Falha ao registrar clique de contato da arena $arenaId: $error');
      debugPrintStack(stackTrace: stack);
    }
  }
}
