import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_announcements_repository.dart';
import '../../../domain/focus/focus_campaign_ended.dart';
import '../../../domain/focus/focus_double_elimination.dart';
import '../../../domain/focus/focus_now_state.dart';
import '../../../domain/focus/focus_providers.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/koc/koc_round_providers.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_detail_tabs_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_group_standings_logic.dart';
import '../../../domain/tournament_match_display.dart';
import '../../../../../core/time/nexago_event_timezone.dart';
import '../focus_bottom_clearance.dart';
import '../focus_rosters.dart';
import '../focus_section_header.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../widgets/focus_day_rail.dart';
import '../widgets/focus_koc_round_card.dart';
import '../widgets/focus_lives_card.dart';
import '../widgets/focus_now_hero.dart';
import '../widgets/focus_share_match_sheet.dart';

/// Seção "Agora": o que o atleta precisa saber nos próximos minutos, seguido da
/// ordem do dia, dos avisos do organizador e do que está em quadra na categoria
/// dele.
class FocusAgoraSection extends ConsumerWidget {
  const FocusAgoraSection({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final String? categoryId;
  final Set<String> athleteTeamIds;

  void _openMatch(BuildContext context, String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  /// Rota até a ARENA, não até a quadra: as quadras do torneio são só `{id,
  /// name}`, sem posição.
  Future<void> _openMaps() async {
    final query = tournament.locationAddress?.trim().isNotEmpty == true
        ? tournament.locationAddress!.trim()
        : '${tournament.location}, ${tournament.city}';
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1'
      '&query=${Uri.encodeComponent(query)}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournament.id));

    return cardsAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (error, stackTrace) => Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Center(
          child: Text(
            'Não foi possível carregar as partidas de hoje.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyM.copyWith(
              color: colors.onSurfaceMuted,
            ),
          ),
        ),
      ),
      data: (cards) => _body(context, ref, cards),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    List<TournamentMatchCardViewModel> cards,
  ) {
    final byId = {for (final c in cards) c.match.id: c};
    final all = [for (final c in cards) c.match];
    final now = DateTime.now();

    final rosters = FocusRosters.fromCards(cards);

    final categoryMatches = categoryId == null
        ? all
        : all.where((m) => m.categoryId == categoryId).toList();

    final day = myTournamentDayTimeline(
      all,
      athleteTeamIds,
      now,
      tournamentRunningToday: tournamentIsEventToday(tournament, now),
    );

    // Rail: TODAS as partidas do atleta na categoria (ou no torneio), não só
    // as de hoje — jogadas e a jogar. O filtro de dia escondia encerradas sem
    // horário e jogos de outros dias do evento.
    final railMatches = myFocusMatchRailTimeline(
      categoryMatches,
      athleteTeamIds,
    );

    // Herói: próxima partida do atleta em QUALQUER dia.
    final next = pickAthleteFocusNextMatch(all, athleteTeamIds);
    final acknowledged = ref.watch(focusAcknowledgedCallProvider);
    final offer = _offerOf();
    final isDouble =
        offer != null && isDoubleEliminationBracketFormat(offer.bracketFormat);
    final qualifiers = offer?.qualifiersPerGroup ?? 2;
    final campaignEnded = categoryId != null &&
        athleteFocusCampaignEnded(
          matches: categoryMatches,
          categoryId: categoryId!,
          myTeamIds: athleteTeamIds,
          isDoubleElimination: isDouble,
          qualifiersPerGroup: qualifiers,
        );
    final state = focusNowStateWithCampaignOf(
      next,
      acknowledged,
      categoryHasPendingKnockout:
          categoryId != null &&
          hasPendingKnockoutInCategory(categoryMatches, categoryId!) &&
          !campaignEnded &&
          (isDouble ||
              !eliminatedFromKnockout(
                categoryMatches,
                categoryId!,
                athleteTeamIds,
              )),
      campaignEnded: campaignEnded,
    );

    final ctx = FocusViewContext(
      matches: categoryMatches,
      myTeamIds: athleteTeamIds,
      duoNameOf: rosters.nameOf,
      standingsOf: (_) => const [],
      nextMatch: next,
    );

    final standing = isDouble && categoryId != null
        ? focusDoubleEliminationStandingOf(
            categoryMatches,
            categoryId!,
            athleteTeamIds,
            phaseLabelOf: (m) =>
                matchPhaseDisplayLabel(m, categoryMatches: categoryMatches),
          )
        : null;
    final inRepescagem = standing?.side == FocusBracketSide.losers;
    final accent = inRepescagem ? AppColors.pending : AppColors.brand;

    final heroView = nextMatchViewOf(ctx, now);
    // Só confrontos definidos — sem fases futuras / slots sem adversário.
    final entries = timelineOf(ctx, railMatches);
    final announcements =
        ref.watch(tournamentAnnouncementsProvider(tournament.id)).valueOrNull ??
        const [];

    final phaseMeta = _phaseMetaOf(next);
    final dayItems = _dayRailItems(entries, byId);
    final campaign = state == FocusNowState.eliminated && categoryId != null
        ? focusCampaignSummaryOf(
            matches: categoryMatches,
            categoryId: categoryId!,
            myTeamIds: athleteTeamIds,
          )
        : null;

    return ListView(
      padding: EdgeInsets.only(
        top: AppSpacing.md,
        bottom: focusBottomClearance(context),
      ),
      children: [
        // Rodada KOTC tem card próprio: o herói de duelo mostra
        // "você × adversário", e a rodada não tem adversário — tem elenco.
        if (next != null && next.isKingOfCourt)
          FocusKocRoundCard(
            match: next,
            round: ref.watch(kocRoundProvider(next.id)).valueOrNull,
            myTeamIds: athleteTeamIds,
            nameOf: rosters.nameOf,
            phaseLabel: kingOfCourtPhaseLabel(next).toUpperCase(),
            onOpenMaps: athleteFirstMatchStarted(day) ? null : _openMaps,
          )
        else
          FocusNowHero(
            state: state,
            view: heroView,
            card: next == null ? null : byId[next.id],
            contextTag: standing != null
                ? _bracketContextTag(next, standing)
                : _contextTag(next, categoryMatches),
            calledAt: next?.matchStartedAt != null
                ? matchTimeLabelForCard(next!)
                : null,
            walkAwayLabel: null,
            accent: accent,
            leadIn: inRepescagem
                ? 'Você perdeu ${standing!.lastLossPhase != null ? 'em ${standing.lastLossPhase!.toLowerCase()}' : 'na chave dos vencedores'}. '
                      'Ainda dá título — pela repescagem o caminho passa pela '
                      'final dos perdedores.'
                : null,
            phaseEyebrow: phaseMeta.$1,
            phaseValue: phaseMeta.$2,
            timeEyebrow: _timeEyebrowOf(next, now),
            timeLabel: _matchDateTimeLabel(next),
            firstMatchStarted: athleteFirstMatchStarted(day),
            campaign: campaign,
            onAcknowledge: () => ref
                .read(focusAcknowledgedCallProvider.notifier)
                .acknowledge(next!.id),
            onOpenMatch: () => _openMatch(context, next!.id),
            onOpenMaps: _openMaps,
            onShare: () => showFocusShareMatchSheet(context, next!.id),
          ),
        if (standing != null && state != FocusNowState.eliminated) ...[
          const FocusSectionHeader(label: 'ONDE VOCÊ ESTÁ'),
          FocusBracketSideCards(
            standing: standing,
            winnersLabel: switch (standing.side) {
              FocusBracketSide.winners => 'Você está aqui',
              _ => 'Eliminado desta chave',
            },
            losersLabel: switch (standing.side) {
              FocusBracketSide.winners => 'Rede de segurança',
              FocusBracketSide.losers => 'Você está aqui',
              FocusBracketSide.eliminated => 'Eliminado desta chave',
            },
          ),
        ],
        FocusDayRail(
          items: dayItems,
          eliminated: state == FocusNowState.eliminated,
          onOpen: (id) => _openMatch(context, id),
        ),
        if (announcements.isNotEmpty) ...[
          const FocusSectionHeader(label: 'AVISOS DO ORGANIZADOR'),
          for (final a in announcements)
            _Announcement(
              time: a.createdAt != null ? _hhmm(a.createdAt!) : '',
              message: a.message,
            ),
        ],
      ],
    );
  }

  static String _hhmm(DateTime at) {
    final local = at.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  TournamentCategoryOffer? _offerOf() {
    for (final offer in tournament.categoryOffers) {
      if (offer.id == categoryId) return offer;
    }
    return null;
  }

  /// Tag curta do herói: "GRUPO B • R3" / "QUARTAS".
  static String _contextTag(
    TournamentMatch? m,
    List<TournamentMatch> categoryMatches,
  ) {
    if (m == null) return 'SUA PRÓXIMA';
    if (m.poolId.trim().isNotEmpty) {
      final pool =
          categoryMatches.where((o) => o.poolId == m.poolId).toList();
      return '${poolLabelForId(m.poolId).toUpperCase()} • '
          'R${poolRoundDisplayNumberOf(pool, m)}';
    }
    return matchPhaseDisplayLabel(m).toUpperCase();
  }

  static String _bracketContextTag(
    TournamentMatch? m,
    FocusDoubleEliminationStanding standing,
  ) {
    final side = switch (standing.side) {
      FocusBracketSide.winners => 'VENCEDORES',
      FocusBracketSide.losers => 'REPESCAGEM',
      FocusBracketSide.eliminated => 'ELIMINADO',
    };
    if (m == null) return side;
    return '$side • ${matchPhaseDisplayLabel(m).toUpperCase()}';
  }

  /// Coluna da faixa glass: eyebrow + valor.
  static (String, String) _phaseMetaOf(TournamentMatch? m) {
    if (m == null) return ('Fase', '—');
    if (m.poolId.trim().isNotEmpty) {
      return ('Fase de Grupos', poolLabelForId(m.poolId));
    }
    return ('Chave', matchPhaseDisplayLabel(m));
  }

  /// "Hoje" / "Amanhã" / "Sáb" — a coluna de horário da faixa glass.
  static String _timeEyebrowOf(TournamentMatch? m, DateTime now) {
    final at = m?.scheduleTime;
    if (at == null) return 'Horário';
    final local = toNexagoEventLocal(at);
    final todayLocal = toNexagoEventLocal(now);
    final today = DateTime(todayLocal.year, todayLocal.month, todayLocal.day);
    final day = DateTime(local.year, local.month, local.day);
    final delta = day.difference(today).inDays;
    if (delta == 0) return 'Hoje';
    if (delta == 1) return 'Amanhã';
    const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    return weekdays[local.weekday - 1];
  }

  /// Data + hora do jogo — sempre com dia, porque a próxima pode ser outro dia.
  static String _matchDateTimeLabel(TournamentMatch? m) {
    final at = m?.scheduleTime;
    if (at == null) return 'A definir';
    final local = toNexagoEventLocal(at);
    final dd = local.day.toString().padLeft(2, '0');
    final mm = local.month.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final min = local.minute.toString().padLeft(2, '0');
    return '$dd/$mm · $hh:$min';
  }

  static List<FocusDayRailItem> _dayRailItems(
    List<TimelineEntry> entries,
    Map<String, TournamentMatchCardViewModel> byId,
  ) {
    final items = <FocusDayRailItem>[];
    for (final e in entries) {
      // Só partidas concretas no rail — fases futuras sem match viram card
      // "A definir" quando têm note/phase.
      final id = e.matchId;
      String title;
      if (id != null && byId[id] != null) {
        final number = matchNumberLabelForCard(byId[id]!.match).trim();
        title = number.isEmpty ? e.phaseLabel : 'Jogo $number';
      } else {
        title = e.phaseLabel;
      }

      // Encerrada: placar sob a ótica do atleta (V/D). Sem isso o card jogado
      // parecia "só horário" e sumia no meio das próximas.
      final subtitle = e.state == TimelineState.done
          ? (e.outcomeLabel ?? e.time ?? 'Encerrada')
          : (e.time ?? e.note ?? 'A definir');

      items.add(
        FocusDayRailItem(
          title: title,
          subtitle: subtitle,
          state: e.state,
          matchId: id,
          outcome: e.outcome,
        ),
      );
    }
    return items;
  }
}

class _Announcement extends StatelessWidget {
  const _Announcement({required this.time, required this.message});

  final String time;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 48,
            child: Text(
              time,
              style: AppTypography.monoMeta.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}
