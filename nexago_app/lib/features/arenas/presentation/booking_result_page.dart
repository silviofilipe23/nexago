import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/booking_result.dart';
import '../domain/booking_story.dart';
import '../domain/booking_story_providers.dart';
import 'booking_result_score_page.dart';
import 'widgets/booking_story/booking_result_card.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// Abre o pós-jogo por cima de tudo (fora do shell com a barra).
Future<void> openBookingResult(BuildContext context, BookingStoryArgs args) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => BookingResultPage(args: args)),
  );
}

/// Reservar · 16 — pós-jogo: o atleta lança o placar da partida que jogou na
/// quadra reservada e posta o resultado no story. O placar não é gravado.
class BookingResultPage extends ConsumerStatefulWidget {
  const BookingResultPage({super.key, required this.args});

  final BookingStoryArgs args;

  @override
  ConsumerState<BookingResultPage> createState() => _BookingResultPageState();
}

class _BookingResultPageState extends ConsumerState<BookingResultPage>
    with BookingStoryEditorMixin {
  /// `null` até o atleta salvar um placar: enquanto isso o inicial acompanha
  /// a galera da reserva, que chega aos poucos (perfil, doc da reserva).
  BookingResult? _edited;
  final Set<BookingResultInfo> _hidden = {};

  void _toggleInfo(BookingResultInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  Future<void> _editScore(
    BookingResult result,
    List<ResultPlayer> crew,
    String? ownerId,
  ) async {
    final edited = await Navigator.of(context).push<BookingResult>(
      MaterialPageRoute(
        builder: (_) => BookingResultScorePage(
          initial: result,
          candidates: crew,
          ownerPlayerId: ownerId,
        ),
      ),
    );
    if (edited != null && mounted) setState(() => _edited = edited);
  }

  @override
  Widget build(BuildContext context) {
    final args = widget.args;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final source = ref.watch(bookingStorySourceProvider(args.bookingId));
    final ownerId = profile?.id ?? source?.ownerUid;
    final crew = bookingResultCrew(
      ownerUid: ownerId,
      ownerName:
          profile == null ? null : athleteDisplayName(profile, fallback: ''),
      ownerAvatarUrl: profile?.avatarUrl,
      confirmed: source?.confirmed ?? const [],
    );
    final result = _edited ?? initialBookingResult(crew);
    final story = bookingStoryDataFrom(
      arenaName: args.arenaName,
      courtName: args.courtName,
      dateKey: args.dateKey,
      startTime: args.startTime,
      endTime: args.endTime,
    );
    final art = BookingResultArtData(
      headline: bookingResultHeadline(source?.sport),
      duration: bookingResultDuration(args.startTime, args.endTime),
      dateLabel: story.dateLabel,
      placeLabel: story.courtName.isEmpty
          ? story.arenaName
          : '${story.arenaName} · ${story.courtName}',
    );
    final available = [
      for (final info in BookingResultInfo.values)
        if (switch (info) {
          BookingResultInfo.sets => !result.isRotation,
          BookingResultInfo.duration => art.duration.isNotEmpty,
          _ => true,
        })
          info,
    ];
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };
    void edit() => _editScore(result, crew, ownerId);

    return BookingStoryEditorScaffold(
      title: 'Pós-jogo',
      cardKey: storyCardKey,
      card: BookingResultCard(
        result: result,
        art: art,
        theme: storyTheme,
        infos: infos,
        photo: storyPhoto,
      ),
      theme: storyTheme,
      photo: storyPhoto,
      busy: storyBusy,
      onPickPhoto: pickStoryPhoto,
      onSelectTheme: selectStoryTheme,
      onSave: () => shareStory(fileName: 'nexago_resultado.png'),
      onPost: () => shareStory(
        caption: bookingResultShareText(result, story.arenaName),
        fileName: 'nexago_resultado.png',
      ),
      header: [
        BookingStorySectionLabel(
          result.isRotation ? 'Classificação' : 'Resultado',
          action: TextButton(
            key: const Key('booking-result-edit'),
            onPressed: edit,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.brand,
              minimumSize: const Size(0, 28),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: const Text('Editar placar'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
          child: _ResultSummary(
            result: result,
            ownerTeamId: resultOwnerTeamId(result, ownerId),
            onTap: edit,
          ),
        ),
      ],
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('booking-result-info-${info.name}'),
            label: info.label,
            selected: infos.contains(info),
            onTap: () => _toggleInfo(info),
          ),
      ],
    );
  }
}

/// "2–1 · 21–18 · 17–21 · 15–12 · VITÓRIA" — ou o líder, na rotação.
class _ResultSummary extends StatelessWidget {
  const _ResultSummary({
    required this.result,
    required this.ownerTeamId,
    required this.onTap,
  });

  final BookingResult result;
  final int ownerTeamId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final String big;
    final String detail;
    String? outcome;
    if (!result.hasScore) {
      big = '0–0';
      detail = 'Toque para lançar o placar';
    } else if (result.isRotation) {
      final leaderId = result.leaderId;
      final leader = leaderId == null ? null : result.teamById(leaderId);
      big = leader == null ? '—' : '${result.winsOf(leader.id)}V';
      detail = leader == null
          ? 'Empate na frente · ${result.games.length} jogos'
          : '${leader.name} na frente · ${result.games.length} jogos';
    } else {
      final a = result.teams[0].id;
      final b = result.teams[1].id;
      big = '${result.winsOf(a)}–${result.winsOf(b)}';
      detail = bookingResultSetsLine(result);
      outcome = bookingResultOutcome(result, ownerTeamId);
    }
    final outcomeColor = switch (outcome) {
      'VITÓRIA' => AppColors.win,
      'DERROTA' => AppColors.live,
      _ => colors.onSurfaceMuted,
    };

    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Text(
                big,
                style: AppTypography.mono(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurface.withValues(alpha: 0.75),
                  ),
                ),
              ),
              if (outcome != null) ...[
                const SizedBox(width: 8),
                Text(
                  outcome,
                  style: AppTypography.mono(
                    fontSize: 10,
                    letterSpacing: 1,
                    color: outcomeColor,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
