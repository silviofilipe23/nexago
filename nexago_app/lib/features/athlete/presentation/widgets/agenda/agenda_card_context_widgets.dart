import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/links/open_external_url.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../tournaments/domain/athlete_tournament_day_providers.dart';
import '../../../../weather/application/weather_providers.dart';
import '../../../../weather/presentation/weather_ui.dart';
import '../../../domain/agenda/agenda_card_context.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';
import '../../../domain/agenda/athlete_agenda_providers.dart';

/// Chance de chuva da reserva nas próximas 48h, com a previsão real do
/// servidor (a mesma do detalhe da reserva). Fora da janela ou sem previsão,
/// não aparece.
class AgendaRainPill extends ConsumerWidget {
  const AgendaRainPill({super.key, required this.rental, required this.now});

  final AthleteAgendaRentalPayload rental;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!agendaRainWindowOpen(rental, now: now)) {
      return const SizedBox.shrink();
    }
    final forecast =
        ref.watch(bookingWeatherForecastProvider(rental.bookingId)).valueOrNull;
    final badge = agendaRainBadge(
      forecast,
      game: (start: rental.startAt, end: rental.endAt),
    );
    if (badge == null) return const SizedBox.shrink();

    final colors = context.themeColors;
    final tone =
        badge.rainy ? WeatherTone.rainText(context) : colors.onSurfaceMuted;
    return Padding(
      key: Key('agenda-rain-${rental.bookingId}'),
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          if (badge.rainy)
            WeatherRainIcon(size: 15, color: tone)
          else
            Icon(Icons.wb_sunny_outlined, size: 15, color: tone),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              badge.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: tone,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Como chegar" (abre o mapa) e "Calendário" (evento no Google Agenda) da
/// reserva que ainda vai acontecer.
class AgendaRentalWayActions extends StatelessWidget {
  const AgendaRentalWayActions({
    super.key,
    required this.rental,
    required this.arenaName,
    this.addressLine,
  });

  final AthleteAgendaRentalPayload rental;
  final String arenaName;
  final String? addressLine;

  Future<void> _open(BuildContext context, String? url, String failure) async {
    final opened = url != null && await openExternalUrl(url);
    if (!opened && context.mounted) {
      showAppSnackBar(context, failure, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = TextButton.styleFrom(
      foregroundColor: colors.onSurface,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      visualDensity: VisualDensity.compact,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 4,
        children: [
          TextButton.icon(
            key: Key('agenda-maps-${rental.bookingId}'),
            style: style,
            onPressed: () => _open(
              context,
              agendaRentalMapsUrl(
                arenaName: arenaName,
                addressLine: addressLine,
              ),
              'Não foi possível abrir o mapa.',
            ),
            icon: const Icon(Icons.directions_outlined, size: 18),
            label: const Text('Como chegar'),
          ),
          Tooltip(
            message: 'Adicionar ao calendário',
            child: TextButton.icon(
              key: Key('agenda-calendar-${rental.bookingId}'),
              style: style,
              onPressed: () => _open(
                context,
                agendaRentalCalendarUrl(rental, arenaName: arenaName),
                'Não foi possível abrir o calendário.',
              ),
              icon: const Icon(Icons.event_available_outlined, size: 18),
              label: const Text('Calendário'),
            ),
          ),
        ],
      ),
    );
  }
}

/// No dia do torneio: quando e onde é a próxima partida do atleta. A chamada
/// de quadra chega ao vivo e toma o lugar do horário.
class AgendaTournamentNextMatchPanel extends ConsumerWidget {
  const AgendaTournamentNextMatchPanel({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final call = ref.watch(athleteCourtCallMatchProvider).valueOrNull;
    final next = call != null && call.tournamentId == tournamentId
        ? call
        : ref
            .watch(agendaTournamentNextMatchProvider(tournamentId))
            .valueOrNull;
    if (next == null) return const SizedBox.shrink();

    final colors = context.themeColors;
    final line = agendaNextMatchLine(next, now: DateTime.now());
    final tone = line.isCourtCall ? colors.live : colors.onSurfaceMuted;
    return Container(
      key: Key('agenda-next-match-$tournamentId'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: line.isCourtCall
            ? Border.all(color: colors.live.withValues(alpha: 0.5))
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            line.eyebrow,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: tone,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            line.detail,
            style: AppTypography.mono(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
