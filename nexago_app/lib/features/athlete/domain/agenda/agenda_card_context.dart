import 'package:intl/intl.dart';

import '../../../../core/formatting/app_date_format.dart';
import '../../../arenas/domain/arena_booking_success_actions.dart';
import '../../../tournaments/domain/athlete_tournament_day_logic.dart';
import '../../../tournaments/domain/athlete_tournament_day_providers.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../weather/domain/weather_booking_rules.dart';
import '../../../weather/domain/weather_models.dart';
import 'athlete_agenda_models.dart';

/// Contexto do compromisso no card da Agenda (Fase 2 da análise de UI/UX):
/// chance de chuva, como chegar, adicionar ao calendário e, no dia do
/// torneio, a próxima partida do atleta.

/// Janela em que o card da reserva mostra a previsão: nas próximas 48h.
const kAgendaRainWindow = Duration(hours: 48);

/// A reserva está na janela da previsão? De pé (nem cancelada nem acabada) e
/// começando em até [kAgendaRainWindow]. Fora dela o card nem pergunta ao
/// servidor.
bool agendaRainWindowOpen(
  AthleteAgendaRentalPayload rental, {
  required DateTime now,
}) {
  if (rental.stage == AthleteAgendaBookingStage.canceled ||
      rental.stage == AthleteAgendaBookingStage.past) {
    return false;
  }
  if (!rental.endAt.isAfter(now)) return false;
  return !rental.startAt.isAfter(now.add(kAgendaRainWindow));
}

/// Selo de tempo do card: [rainy] pinta como chuva; [label] é o texto curto.
class AgendaRainBadge {
  const AgendaRainBadge({required this.rainy, required this.label});

  final bool rainy;
  final String label;
}

/// Selo a partir da previsão gravada pelo servidor (a mesma do detalhe da
/// reserva). `null` sem previsão: provedor fora, jogo longe demais
/// (`availableFrom`) ou sem horas.
AgendaRainBadge? agendaRainBadge(
  BookingWeatherForecast? forecast, {
  required ({DateTime start, DateTime end}) game,
}) {
  if (forecast == null || forecast.availableFrom != null) return null;
  final o = weatherForecastOutlook(forecast.hours, game: game);
  if (o == null) return null;
  final chance = o.hour.probability?.round();
  String withChance(String text) => chance == null ? text : '$text · $chance%';
  return switch (o.outlook) {
    WeatherOutlook.heavyRain => AgendaRainBadge(
        rainy: true,
        label: withChance('Chuva forte às ${o.hour.hourLabel}'),
      ),
    WeatherOutlook.chanceOfRain => AgendaRainBadge(
        rainy: true,
        label: withChance('Chuva às ${o.hour.hourLabel}'),
      ),
    WeatherOutlook.dry =>
      const AgendaRainBadge(rainy: false, label: 'Sem chuva no horário'),
  };
}

final _hm = DateFormat('HH:mm');

/// Evento da reserva no Google Agenda (o mesmo link da tela de sucesso).
String? agendaRentalCalendarUrl(
  AthleteAgendaRentalPayload rental, {
  required String arenaName,
}) =>
    ArenaBookingSuccessActions.buildGoogleCalendarEventUrl(
      title: 'Reserva · $arenaName',
      dateKey: calendarDateKey(rental.startAt),
      startTime: _hm.format(rental.startAt),
      endTime: _hm.format(rental.endAt),
      details: rental.courtName,
      location: arenaName,
    );

/// Busca da arena no mapa; com endereço, "Arena, endereço".
String agendaRentalMapsUrl({required String arenaName, String? addressLine}) =>
    ArenaBookingSuccessActions.buildMapsSearchUrl(
      ArenaBookingSuccessActions.mapsQueryFromArena(
        arenaName: arenaName,
        addressLine: addressLine,
      ),
    );

/// Próxima partida do atleta no torneio [tournamentId], no dia do evento.
/// Mesma escolha do Modo Focus ([pickAthleteNextMatch]), só que por torneio:
/// o card de cada torneio mostra a partida dele.
AthleteNextMatch? pickAgendaTournamentNextMatch(
  AthleteEventDayContext ctx, {
  required String tournamentId,
}) {
  AthleteNextMatch? best;
  var bestPriority = 1 << 30;
  for (final reg in ctx.registrations) {
    if (reg.tournamentId != tournamentId) continue;
    final teamId = reg.teamId?.trim() ?? '';
    if (teamId.isEmpty) continue;
    final candidate = pickAthleteNextMatch(
      matches: ctx.matchesByTournament[tournamentId] ?? const [],
      teamId: teamId,
      tournamentId: tournamentId,
      tournamentName: reg.tournamentName,
      today: ctx.now,
    );
    if (candidate == null) continue;
    final priority = athleteMatchPriority(candidate.match, teamId);
    if (priority < bestPriority) {
      best = candidate;
      bestPriority = priority;
    }
  }
  return best;
}

/// Linha da próxima partida no card do torneio: [eyebrow] com a fase
/// ("PRÓXIMA PARTIDA · FINAL") e [detail] com horário e quadra.
class AgendaNextMatchLine {
  const AgendaNextMatchLine({
    required this.eyebrow,
    required this.detail,
    required this.isCourtCall,
  });

  final String eyebrow;
  final String detail;
  final bool isCourtCall;
}

AgendaNextMatchLine agendaNextMatchLine(
  AthleteNextMatch next, {
  required DateTime now,
}) {
  final match = next.match;
  final phase = matchPhaseDisplayLabel(match);
  final lead = next.isCourtCall ? 'CHAMADA PARA A QUADRA' : 'PRÓXIMA PARTIDA';
  final time =
      next.isCourtCall ? '' : matchTimeLabelForCard(match, reference: now);
  final detail = [time, matchCourtLabelForCard(match)]
      .where((s) => s.isNotEmpty)
      .join(' · ');
  return AgendaNextMatchLine(
    eyebrow: phase.isEmpty ? lead : '$lead · $phase',
    detail: detail.isEmpty ? 'Horário a definir' : detail,
    isCourtCall: next.isCourtCall,
  );
}
