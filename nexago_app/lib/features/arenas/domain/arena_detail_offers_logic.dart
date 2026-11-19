import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';

/// "Outras formas de jogar" no perfil da arena: um cartão curto para cada
/// oferta além da reserva avulsa. Tocar leva à seção completa mais abaixo.

enum ArenaOfferKind { schedulePlan, club, classes }

/// Próxima sessão de Clubinho, só com o que o cartão mostra.
class ArenaOfferClubSession {
  const ArenaOfferClubSession({
    required this.startTime,
    required this.spotsLeft,
    required this.priceReais,
    this.startAt,
  });

  final DateTime? startAt;
  final String startTime;
  final int spotsLeft;
  final double priceReais;
}

class ArenaOfferSummary {
  const ArenaOfferSummary({
    required this.kind,
    required this.kicker,
    required this.title,
    required this.subtitle,
  });

  final ArenaOfferKind kind;
  final String kicker;
  final String title;
  final String subtitle;
}

final _weekdayFmt = DateFormat('EEE, d', 'pt_BR');

/// Cartões na ordem: horário fixo, Clubinho, aulas. Some o que a arena não
/// oferece.
List<ArenaOfferSummary> arenaOtherOffers({
  required List<double> planMonthlyPrices,
  required ArenaOfferClubSession? nextClubSession,
  required bool classSignupOpen,
  required int professorsCount,
}) {
  final prices = planMonthlyPrices.where((p) => p > 0).toList();
  final club = nextClubSession;
  return List.unmodifiable([
    if (prices.isNotEmpty)
      ArenaOfferSummary(
        kind: ArenaOfferKind.schedulePlan,
        kicker: 'HORÁRIO FIXO',
        title: 'Plano mensal',
        subtitle: 'a partir de ${formatBRLWhole(prices.reduce(_min))}',
      ),
    if (club != null)
      ArenaOfferSummary(
        kind: ArenaOfferKind.club,
        kicker: 'CLUBINHO',
        title: _clubWhen(club),
        subtitle: club.spotsLeft <= 0
            ? 'Lista cheia'
            : '${_spots(club.spotsLeft)} · ${formatBRLWhole(club.priceReais)}',
      ),
    if (classSignupOpen || professorsCount > 0)
      ArenaOfferSummary(
        kind: ArenaOfferKind.classes,
        kicker: 'AULAS',
        title: classSignupOpen ? 'Planos de aula' : 'Professores',
        subtitle: professorsCount > 0
            ? '$professorsCount '
                '${professorsCount == 1 ? 'professor' : 'professores'}'
            : 'Turmas com vaga',
      ),
  ]);
}

double _min(double a, double b) => a < b ? a : b;

String _spots(int n) => n == 1 ? '1 vaga' : '$n vagas';

String _clubWhen(ArenaOfferClubSession session) {
  final start = session.startAt;
  final time = session.startTime.trim();
  if (start == null) return time.isEmpty ? 'Próxima sessão' : time;
  final day = _weekdayFmt.format(start).replaceAll('.', '');
  return time.isEmpty ? day : '$day · $time';
}
