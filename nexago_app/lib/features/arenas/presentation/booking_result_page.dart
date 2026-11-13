import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/booking_arena_art.dart';
import '../domain/booking_result.dart';
import '../domain/booking_result_record.dart';
import '../domain/booking_result_record_providers.dart';
import '../domain/booking_social_unlock.dart';
import '../domain/booking_story.dart';
import '../domain/booking_story_providers.dart';
import 'lancar_placar/lancar_placar_page.dart';
import 'pelada_detail_page.dart';
import 'widgets/booking_story/booking_result_card.dart';
import 'widgets/booking_story/booking_social_locked_view.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// Abre o pós-jogo por cima de tudo (fora do shell com a barra).
Future<void> openBookingResult(BuildContext context, BookingStoryArgs args) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(builder: (_) => BookingResultPage(args: args)),
  );
}

/// Reservar · 16 — pós-jogo: a arte do resultado para o story. O placar se
/// lança pelo "Lançar placar" ([LancarPlacarPage]), que grava a pelada em
/// `bookingResults`: todo mundo no placar confirma, e só então ela conta nas
/// estatísticas. Editar depois volta tudo a pendente.
class BookingResultPage extends ConsumerStatefulWidget {
  const BookingResultPage({
    super.key,
    required this.args,
    this.presetResult,
    this.presetSport,
  });

  final BookingStoryArgs args;

  /// "Compartilhar resultado" do detalhe da pelada: só a arte deste placar,
  /// sem editar (serve também a quem não está nele).
  final BookingResult? presetResult;
  final String? presetSport;

  @override
  ConsumerState<BookingResultPage> createState() => _BookingResultPageState();
}

class _BookingResultPageState extends ConsumerState<BookingResultPage>
    with BookingStoryEditorMixin {
  /// `null` até o atleta salvar um placar nesta tela: enquanto isso vale o
  /// placar já gravado ou, sem ele, o inicial pela galera da reserva, que
  /// chega aos poucos (perfil, doc da reserva).
  BookingResult? _edited;
  final Set<BookingResultInfo> _hidden = {};

  void _toggleInfo(BookingResultInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  /// "Lançar placar" / "Editar placar": o fluxo de 2 passos.
  Future<void> _launch() async {
    final outcome = await openLancarPlacar(
      context,
      widget.args,
      presetSport: widget.presetSport,
      fromStoryEditor: true,
    );
    // Enviado ou só para a arte: a arte já mostra o placar novo (o salvo
    // ainda chega pelo Firestore).
    if (outcome != null && mounted) {
      setState(() => _edited = outcome.result);
    }
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
    final uid = ref.watch(bookingResultUidProvider);
    // Placar, story e arte do resultado pedem metade da reserva paga pelo app
    // (a callable recusa o placar do mesmo jeito). Ao vivo: o doc da reserva
    // muda quando o pagamento confirma e a tela troca sozinha.
    final unlock = ref.watch(bookingSocialUnlockProvider(args.bookingId));
    if (unlock == null) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }
    if (!unlock.unlocked) {
      return BookingSocialLockedView(
        unlock: unlock,
        isOwner: source?.ownerUid == null || source!.ownerUid == uid,
      );
    }
    final preset = widget.presetResult;
    final saved = preset != null
        ? null
        : ref.watch(savedBookingResultProvider(args.bookingId));
    final result =
        preset ?? _edited ?? saved?.result ?? initialBookingResult(crew);
    final shareOnly = preset != null;
    final story = bookingStoryDataFrom(
      arenaName: args.arenaName,
      courtName: args.courtName,
      dateKey: args.dateKey,
      startTime: args.startTime,
      endTime: args.endTime,
    );
    // Capa e logo da arena (canvas "Pelada · placares…", 17 e 18): a capa
    // fica como opção na "Foto de fundo" (o fundo padrão segue Brasa); o
    // logo vai ao lado do nome.
    final arenaId = (widget.args.arenaId ?? source?.arenaId ?? '').trim();
    final arenaArt = arenaId.isEmpty
        ? null
        : ref.watch(bookingArenaArtProvider(arenaId)).valueOrNull;
    arenaCoverPhoto = arenaArt?.cover;
    final art = BookingResultArtData(
      arenaLogo: arenaArt?.logo,
      headline: bookingResultHeadline(widget.presetSport ?? source?.sport),
      duration: bookingResultDuration(args.startTime, args.endTime),
      dateLabel: story.dateLabel,
      placeLabel: story.courtName.isEmpty
          ? story.arenaName
          : '${story.arenaName} · ${story.courtName}',
    );
    final available = [
      for (final info in BookingResultInfo.values)
        if (switch (info) {
          // No rei da quadra vira "Jogos": a grade de placares da arte.
          BookingResultInfo.sets => result.hasScore,
          BookingResultInfo.duration => art.duration.isNotEmpty,
          _ => true,
        })
          info,
    ];
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };
    void edit() {
      if (shareOnly) return;
      _launch();
    }

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
          action: shareOnly
              ? null
              : TextButton(
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
                  child:
                      Text(saved == null ? 'Lançar placar' : 'Editar placar'),
                ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, saved == null ? 18 : 10),
          child: _ResultSummary(
            result: result,
            ownerTeamId: resultOwnerTeamId(result, ownerId),
            onTap: edit,
          ),
        ),
        if (saved != null)
          Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              0,
              20,
              saved.awaitsResponseFrom(uid) ? 4 : 18,
            ),
            child: BookingResultStatusBadge.forViewer(saved: saved, uid: uid),
          ),
        if (saved != null && saved.awaitsResponseFrom(uid))
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 20, 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const Key('booking-result-open-review'),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => PeladaDetailPage(bookingId: args.bookingId),
                  ),
                ),
                style: TextButton.styleFrom(foregroundColor: AppColors.brand),
                child: const Text('Conferir e responder'),
              ),
            ),
          ),
      ],
      infoChips: [
        for (final info in available)
          BookingStoryChip(
            key: Key('booking-result-info-${info.name}'),
            label: info == BookingResultInfo.sets && result.isRotation
                ? 'Jogos'
                : info.label,
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
      'VITÓRIA' => colors.win,
      'DERROTA' => colors.live,
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

/// Pendente / confirmado / contestado do placar salvo — para quem lançou ou,
/// com [forViewer], para quem está vendo (adversário, companheiro).
class BookingResultStatusBadge extends StatelessWidget {
  const BookingResultStatusBadge({super.key, required this.saved})
      : viewerUid = null;

  const BookingResultStatusBadge.forViewer({
    super.key,
    required this.saved,
    required String uid,
  }) : viewerUid = uid;

  final SavedBookingResult saved;
  final String? viewerUid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (icon, tint) = switch (saved.status) {
      BookingResultStatus.confirmed => (Icons.verified_rounded, colors.win),
      BookingResultStatus.disputed => (
          Icons.report_gmailerrorred_rounded,
          colors.live
        ),
      BookingResultStatus.pending => (Icons.schedule_rounded, colors.pending),
    };
    return Row(
      key: Key('booking-result-status-${saved.status.name}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: tint),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            bookingResultViewerStatusLine(saved, viewerUid ?? saved.createdBy),
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              height: 1.4,
              color: colors.onSurface.withValues(alpha: 0.78),
            ),
          ),
        ),
      ],
    );
  }
}
