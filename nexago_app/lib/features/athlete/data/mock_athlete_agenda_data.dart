import '../../../core/theme/app_colors.dart';
import '../domain/agenda/athlete_agenda_logic.dart';
import '../domain/agenda/athlete_agenda_models.dart';

List<AthleteAgendaNeedsYouItem> mockAgendaNeedsYouItems() {
  return const [
    AthleteAgendaNeedsYouItem(
      id: 'mock-needs-challenge-1',
      kind: AthleteAgendaNeedsYouKind.rankingChallenge,
      title: 'Lucas M. te desafiou',
      subtitle: 'Confronto direto 2-1 · Vale a #4 do ranking municipal',
      meta: 'Sáb 30/05 · 09:00 · Arena CFC · Quadra 3',
      statusLabel: 'AGUARDA RESPOSTA',
      isMock: true,
    ),
  ];
}

AthleteAgendaItem mockAgendaLiveTournamentItem({DateTime? now}) {
  final clock = now ?? DateTime.now();
  final today = dateOnly(clock);
  final start = DateTime(today.year, today.month, today.day, 19);
  return AthleteAgendaItem(
    id: 'mock-tournament-live-1',
    kind: AthleteAgendaItemKind.tournament,
    startsAt: start,
    endsAt: start.add(const Duration(hours: 2)),
    title: 'Etapa Garden · Beach Tennis',
    subtitle: 'Arena CFC · Quadra 2 · Sub-19 Masc',
    statusLabel: '2º SET · 14-12',
    accentColor: AppColors.live,
    tournament: const AthleteAgendaTournamentPayload(
      tournamentId: 'mock-tournament-live',
      registrationId: 'mock-reg',
      isLive: true,
    ),
    isMock: true,
  );
}

/// Drop-ins mock para empty state D3 (protótipo).
List<AgendaDropInPreview> mockAgendaDropIns() {
  return const [
    AgendaDropInPreview(
      id: 'dropin-1',
      startHour: 14,
      startMinute: 0,
      arenaLine: 'Arena CFC · Q3',
      kmDistance: 1.2,
      spotsNeeded: 2,
      avatarCount: 4,
    ),
    AgendaDropInPreview(
      id: 'dropin-2',
      startHour: 17,
      startMinute: 0,
      arenaLine: 'Praia BT · central',
      kmDistance: 2.4,
      spotsNeeded: 1,
      avatarCount: 5,
    ),
    AgendaDropInPreview(
      id: 'dropin-3',
      startHour: 19,
      startMinute: 0,
      arenaLine: 'ErreJota · Q1',
      kmDistance: 3.1,
      spotsNeeded: 2,
      avatarCount: 3,
    ),
  ];
}
