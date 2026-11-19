import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;

/// Falha ao ligar a assinatura, com a frase pronta para a tela.
class AthleteCalendarFeedException implements Exception {
  const AthleteCalendarFeedException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Liga o feed `.ics` da Agenda do atleta (`configureAthleteCalendarFeed`) e
/// devolve a URL que o calendário assina. [rotate] gera um link novo e
/// desconecta quem assinou o antigo.
abstract interface class AthleteCalendarFeedRepository {
  Future<String> configure({bool rotate = false});
}

class FunctionsAthleteCalendarFeedRepository
    implements AthleteCalendarFeedRepository {
  FunctionsAthleteCalendarFeedRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  static const _fallback = 'Não foi possível ligar a assinatura do calendário.';

  @override
  Future<String> configure({bool rotate = false}) async {
    try {
      final result = await _functions
          .httpsCallable('configureAthleteCalendarFeed')
          .call<Object?>({if (rotate) 'rotate': true});
      final raw = result.data;
      final url = raw is Map ? raw['url'] : null;
      if (url is! String || url.isEmpty) {
        throw const AthleteCalendarFeedException(_fallback);
      }
      return url;
    } on FirebaseFunctionsException catch (e) {
      throw AthleteCalendarFeedException(
        callableErrorMessage(e.code, e.message, _fallback),
      );
    }
  }
}

final athleteCalendarFeedRepositoryProvider =
    Provider<AthleteCalendarFeedRepository>(
  (ref) => FunctionsAthleteCalendarFeedRepository(),
);
