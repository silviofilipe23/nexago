import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/presentation/booking_details_page.dart';
import '../domain/arena_booking_success_actions.dart';
import '../domain/booking_result.dart';
import '../domain/booking_result_record.dart';
import '../domain/booking_result_record_providers.dart';
import '../domain/booking_story_providers.dart';
import '../domain/pelada.dart';
import 'booking_result_page.dart';
import 'booking_result_score_page.dart';
import 'pelada_analytics.dart';
import 'widgets/booking_story/booking_story_editor.dart';
import 'widgets/pelada/pelada_widgets.dart';

/// 10c · Detalhe da pelada. Quem está no placar vê tudo e age (confirmar,
/// contestar, editar); os outros atletas só chegam aqui com ela confirmada
/// (rule) e só compartilham.
class PeladaDetailPage extends ConsumerStatefulWidget {
  const PeladaDetailPage({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<PeladaDetailPage> createState() => _PeladaDetailPageState();
}

class _PeladaDetailPageState extends ConsumerState<PeladaDetailPage> {
  /// Resposta em envio: some com os botões até o doc voltar atualizado.
  bool _sending = false;

  Future<void> _confirm(SavedBookingResult saved) async {
    setState(() => _sending = true);
    try {
      await ref
          .read(bookingResultRepositoryProvider)
          .respond(saved.bookingId, confirm: true, version: saved.version);
      logPelada(ref, (a) => a.logPeladaConfirmed());
      if (mounted) showAppSnackBar(context, 'Placar confirmado.');
    } catch (e) {
      if (mounted) showAppErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _dispute(SavedBookingResult saved) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => PeladaDisputeSheet(creatorName: saved.createdByName),
    );
    if (reason == null || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref.read(bookingResultRepositoryProvider).respond(
            saved.bookingId,
            confirm: false,
            version: saved.version,
            reason: reason,
          );
      logPelada(ref, (a) => a.logPeladaDisputed(reason));
      if (mounted) showAppSnackBar(context, 'Placar contestado.');
    } catch (e) {
      if (mounted) showAppErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// "Editar placar" / "Revisar placar": abre o Editar placar com o salvo; ao
  /// salvar, todo mundo recebe para confirmar de novo.
  Future<void> _edit(SavedBookingResult saved) async {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final source = ref.read(bookingStorySourceProvider(saved.bookingId));
    final crew = bookingResultCrew(
      ownerUid: profile?.id,
      ownerName:
          profile == null ? null : athleteDisplayName(profile, fallback: ''),
      ownerAvatarUrl: profile?.avatarUrl,
      confirmed: source?.confirmed ?? const [],
    );
    final candidates = [
      ...crew,
      for (final t in saved.result.teams)
        for (final p in t.players)
          if (!p.isGuest && !crew.contains(p)) p,
    ];
    final repository = ref.read(bookingResultRepositoryProvider);
    final edited = await Navigator.of(context).push<BookingResult>(
      MaterialPageRoute(
        builder: (_) => BookingResultScorePage(
          initial: saved.result,
          candidates: candidates,
          ownerPlayerId: saved.createdBy,
          onSave: (r) => repository.save(saved.bookingId, r),
          confirmBeforeSave:
              'Os jogadores vão receber o placar para confirmar novamente.',
        ),
      ),
    );
    if (edited != null) {
      logPelada(ref, (a) => a.logPeladaEdited(saved.version + 1));
    }
  }

  void _share(SavedBookingResult saved) {
    logPelada(ref, (a) => a.logPeladaShared());
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => BookingResultPage(
          args: saved.toStoryArgs(),
          presetResult: saved.result,
          presetSport: saved.sport,
        ),
      ),
    );
  }

  void _openBooking(SavedBookingResult saved) {
    final start = saved.playedAt;
    if (start == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailsPage(
          bookingId: saved.bookingId,
          arenaId: saved.arenaId,
          arenaName: saved.arenaName,
          courtName: saved.courtName ?? 'Quadra',
          startAt: start,
          endAt: start.add(Duration(minutes: saved.minutes)),
          status: 'confirmed',
          confirmedParticipants: saved.playerCount,
          amountReais: saved.bookingAmountReais,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final uid = ref.watch(bookingResultUidProvider);
    final async = ref.watch(peladaProvider(widget.bookingId));
    final saved = async.valueOrNull;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Pelada',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
        actions: [
          if (saved != null)
            IconButton(
              tooltip: 'Compartilhar resultado',
              onPressed: () => _share(saved),
              icon: const Icon(Icons.share_outlined),
            ),
        ],
      ),
      bottomNavigationBar: saved == null || _sending
          ? (_sending
              ? const SafeArea(
                  top: false,
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: AppColors.brand,
                        ),
                      ),
                    ),
                  ),
                )
              : null)
          : _Actions(
              saved: saved,
              uid: uid,
              onConfirm: () => _confirm(saved),
              onDispute: () => _dispute(saved),
              onEdit: () => _edit(saved),
              onShare: () => _share(saved),
            ),
      body: switch (async) {
        AsyncValue(isLoading: true, hasValue: false) => const Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        _ when saved == null => Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'Pelada não encontrada. Ela pode não estar confirmada ainda ou '
                'ter sido corrigida sem você nos times.',
                key: const Key('pelada-missing'),
                textAlign: TextAlign.center,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ),
          ),
        _ => _Body(
            saved: saved,
            uid: uid,
            onOpenBooking:
                saved.canEdit(uid) ? () => _openBooking(saved) : null,
          ),
      },
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.saved, required this.uid, this.onOpenBooking});

  final SavedBookingResult saved;
  final String uid;
  final VoidCallback? onOpenBooking;

  @override
  Widget build(BuildContext context) {
    final r = saved.result;
    final participant = saved.involves(uid);
    final myGames = participant ? peladaMyGames(saved, uid) : const [];
    final myTeam = r.teamOfPlayer(uid)?.id;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        _Hero(saved: saved, uid: uid),
        if (saved.isDisputed) ...[
          const SizedBox(height: 12),
          _DisputeBanner(saved: saved, canEdit: saved.canEdit(uid)),
        ],
        const SizedBox(height: 20),
        if (r.isRotation) ...[
          const _Label('Classificação'),
          _StandingsCard(result: r, myTeamId: myTeam, uid: uid),
          if (myGames.isNotEmpty) ...[
            const SizedBox(height: 20),
            _Label('Seus jogos', trailing: '${myGames.length}'),
            for (final g in myGames)
              _GameRow(
                  result: r, order: g.order, game: g.game, myTeamId: myTeam!),
          ],
        ] else ...[
          const _Label('Sets'),
          _SetsCard(result: r, myTeamId: myTeam),
        ],
        const SizedBox(height: 16),
        _ConfirmationNote(saved: saved, uid: uid),
        if (participant) ...[
          const SizedBox(height: 10),
          _BookingLink(saved: saved, onTap: onOpenBooking),
        ],
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text, {this.trailing});

  final String text;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final style = AppTypography.mono(
      fontSize: 10,
      letterSpacing: 1.4,
      color: PeladaStyle.dim(context.themeColors),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(text.toUpperCase(), style: style)),
          if (trailing != null) Text(trailing!, style: style),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.saved, required this.uid});

  final SavedBookingResult saved;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mine = peladaMineOf(saved, uid);
    final r = saved.result;
    final leaderId = r.leaderId;
    final leaderRow = leaderId == null
        ? null
        : r.standings.firstWhere((s) => s.team.id == leaderId);
    final wins = mine?.wins ?? leaderRow?.wins;
    final losses = mine?.losses ?? leaderRow?.losses;
    final balance = mine?.balance ?? leaderRow?.pointDiff;
    final title = mine != null
        ? peladaHeroTitle(mine)
        : (leaderRow == null
            ? 'Pelada empatada na frente'
            : 'Vitória de ${leaderRow.team.name}');
    final subtitle = mine != null
        ? peladaHeroSubtitle(mine)
        : '${r.games.length} ${r.games.length == 1 ? 'jogo' : 'jogos'}';

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.10),
            AppColors.brand.withValues(alpha: 0.02),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  peladaHeroDateLine(saved),
                  style: AppTypography.mono(
                    fontSize: 10.5,
                    letterSpacing: 1,
                    color: AppColors.brand,
                  ),
                ),
              ),
              PeladaStatusTagView(saved: saved),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            saved.arenaName,
            style: AppTypography.soraRegular(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
              height: 1.1,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            peladaFormatLine(saved),
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: PeladaStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 14),
          Divider(height: 1, color: PeladaStyle.line(colors)),
          const SizedBox(height: 14),
          Row(
            children: [
              if (mine != null) ...[
                PeladaPositionBadge(
                  position: mine.position,
                  of: mine.teamsCount,
                  size: 46,
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      key: const Key('pelada-hero-title'),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: PeladaStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              if (wins != null && losses != null && balance != null)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '$wins–$losses',
                      style: AppTypography.mono(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        height: 1,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'saldo ${peladaBalanceLabel(balance)}',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: balance >= 0 ? AppColors.win : AppColors.live,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DisputeBanner extends StatelessWidget {
  const _DisputeBanner({required this.saved, required this.canEdit});

  final SavedBookingResult saved;
  final bool canEdit;

  @override
  Widget build(BuildContext context) {
    final who = saved.disputedByName?.trim().split(RegExp(r'\s+')).first;
    return Container(
      key: const Key('pelada-dispute-banner'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.live.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.report_outlined, size: 18, color: AppColors.live),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '${who ?? 'Alguém'} contestou'
              '${saved.disputeReason == null ? '' : ': ${saved.disputeReason}'}'
              '${canEdit ? '. Revise o placar e salve de novo.' : '.'}',
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                height: 1.4,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding:
          padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: PeladaStyle.line(colors)),
      ),
      child: child,
    );
  }
}

class _StandingsCard extends StatelessWidget {
  const _StandingsCard({
    required this.result,
    required this.myTeamId,
    required this.uid,
  });

  final BookingResult result;
  final int? myTeamId;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final leader = result.leaderId;
    final rows = result.standings;
    return _Card(
      child: Column(
        children: [
          for (final (i, s) in rows.indexed) ...[
            if (i > 0) Divider(height: 1, color: PeladaStyle.line(colors)),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 18,
                    child: Text(
                      '${s.position}',
                      style: AppTypography.mono(
                        fontSize: 12,
                        color: s.position == 1
                            ? AppColors.brand
                            : PeladaStyle.mute(colors),
                      ),
                    ),
                  ),
                  PeladaFaces(players: s.team.players, size: 24, max: 3),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      s.team.id == myTeamId
                          ? peladaTeamNameFor(s.team, uid)
                          : s.team.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: s.team.id == myTeamId
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: s.team.id == myTeamId
                            ? colors.onSurface
                            : colors.onSurface.withValues(alpha: 0.70),
                      ),
                    ),
                  ),
                  Text(
                    peladaBalanceLabel(s.pointDiff),
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: PeladaStyle.mute(colors),
                    ),
                  ),
                  SizedBox(
                    width: 32,
                    child: Text(
                      '${s.wins}',
                      textAlign: TextAlign.right,
                      style: AppTypography.mono(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: s.team.id == leader
                            ? AppColors.brand
                            : colors.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _GameRow extends StatelessWidget {
  const _GameRow({
    required this.result,
    required this.order,
    required this.game,
    required this.myTeamId,
  });

  final BookingResult result;
  final int order;
  final ResultGame game;
  final int myTeamId;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final won = game.winner == myTeamId;
    final oppId = game.teamA == myTeamId ? game.teamB : game.teamA;
    final mine = game.scoreOf(myTeamId);
    final theirs = game.scoreOf(oppId);
    // Placar perdido: no claro, 45% dava ~2,9:1 no card branco.
    TextStyle score(bool winner) => AppTypography.mono(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: winner
              ? colors.onSurface
              : (colors.isDark
                  ? colors.onSurface.withValues(alpha: 0.45)
                  : PeladaStyle.mute(colors)),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: PeladaStyle.line(colors)),
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 3, color: won ? AppColors.win : AppColors.live),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 26,
                        child: Text(
                          'J$order',
                          style: AppTypography.mono(
                            fontSize: 10,
                            color: PeladaStyle.mute(colors),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          'vs ${result.teamById(oppId)?.name ?? '—'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      Text('$mine', style: score(won)),
                      Text(
                        '  –  ',
                        style: AppTypography.mono(
                          fontSize: 13,
                          color: PeladaStyle.mute(colors),
                        ),
                      ),
                      Text('$theirs', style: score(!won)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Duplas (dois times): "A 2 – 1 B" e os sets.
class _SetsCard extends StatelessWidget {
  const _SetsCard({required this.result, required this.myTeamId});

  final BookingResult result;
  final int? myTeamId;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final a = result.teams[0];
    final b = result.teams[1];
    final wa = result.winsOf(a.id);
    final wb = result.winsOf(b.id);
    Widget name(ResultTeam t, TextAlign align) => Text(
          t.name,
          textAlign: align,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: t.id == myTeamId ? FontWeight.w700 : FontWeight.w500,
            color: colors.onSurface,
          ),
        );
    return _Card(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: name(a, TextAlign.left)),
              Text(
                '$wa – $wb',
                key: const Key('pelada-sets-score'),
                style: AppTypography.mono(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
              Expanded(child: name(b, TextAlign.right)),
            ],
          ),
          const SizedBox(height: 10),
          for (final (i, g) in result.games.indexed)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Text(
                    'S${i + 1}',
                    style: AppTypography.mono(
                      fontSize: 10,
                      color: PeladaStyle.mute(colors),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${g.scoreOf(a.id)}',
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: g.winner == a.id
                          ? colors.onSurface
                          : PeladaStyle.mute(colors),
                    ),
                  ),
                  Text(
                    '  –  ',
                    style: AppTypography.mono(
                      fontSize: 12,
                      color: PeladaStyle.mute(colors),
                    ),
                  ),
                  Text(
                    '${g.scoreOf(b.id)}',
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: g.winner == b.id
                          ? colors.onSurface
                          : PeladaStyle.mute(colors),
                    ),
                  ),
                  const Spacer(),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// "Placar confirmado por 7 de 8 jogadores. Lançado por você."
class _ConfirmationNote extends StatelessWidget {
  const _ConfirmationNote({required this.saved, required this.uid});

  final SavedBookingResult saved;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final confirmed = [
      for (final t in saved.result.teams)
        for (final p in t.players)
          if (saved.confirmations[p.id]?.state ==
              ResultConfirmationState.confirmed)
            p,
    ];
    final by = saved.createdBy == uid
        ? 'você'
        : saved.createdByName.trim().split(RegExp(r'\s+')).first;
    // Confirmado por todos ou pendente mostram a contagem; prazo e
    // contestação trocam a frase.
    final String? head = saved.isConfirmed && saved.autoConfirmed
        ? 'Confirmado pelo prazo de 48h.'
        : (saved.isDisputed
            ? 'Contestado: não conta até ser corrigido.'
            : null);
    final count = '${saved.confirmedCount} de ${saved.playerCount}';
    final pendingNames = bookingResultNamesLine(saved.pendingFirstNames);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: PeladaStyle.line(colors)),
      ),
      child: Row(
        children: [
          PeladaFaces(players: confirmed, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  if (head == null) ...[
                    const TextSpan(text: 'Placar confirmado por '),
                    TextSpan(
                      text: count,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const TextSpan(text: ' jogadores.'),
                  ] else
                    TextSpan(text: head),
                  if (saved.status == BookingResultStatus.pending &&
                      pendingNames.isNotEmpty)
                    TextSpan(text: ' Falta $pendingNames.'),
                  TextSpan(text: ' Lançado por $by.'),
                ],
              ),
              key: const Key('pelada-confirmation-note'),
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                height: 1.45,
                color: colors.onSurface.withValues(alpha: 0.70),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Reserva #NXG-04299 · R$ 30 por pessoa" — toca e abre a reserva (dono).
class _BookingLink extends StatelessWidget {
  const _BookingLink({required this.saved, this.onTap});

  final SavedBookingResult saved;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final price = peladaPricePerPerson(saved);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: const Key('pelada-booking-link'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          child: Row(
            children: [
              Icon(
                Icons.receipt_long_outlined,
                size: 16,
                color: PeladaStyle.dim(colors),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(text: 'Reserva '),
                      TextSpan(
                        text:
                            ArenaBookingSuccessActions.formatBookingDisplayCode(
                          saved.bookingId,
                        ),
                        style: AppTypography.mono(
                          fontSize: 12,
                          color: colors.onSurface,
                        ),
                      ),
                      if (price != null) TextSpan(text: ' · $price'),
                    ],
                  ),
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: PeladaStyle.dim(colors),
                  ),
                ),
              ),
              if (onTap != null)
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: PeladaStyle.mute(colors),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Os botões do rodapé por estado (spec 10c, "Ações por estado").
class _Actions extends StatelessWidget {
  const _Actions({
    required this.saved,
    required this.uid,
    required this.onConfirm,
    required this.onDispute,
    required this.onEdit,
    required this.onShare,
  });

  final SavedBookingResult saved;
  final String uid;
  final VoidCallback onConfirm;
  final VoidCallback onDispute;
  final VoidCallback onEdit;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final canEdit = saved.canEdit(uid);
    final Widget row;
    if (canEdit && saved.isDisputed) {
      row = _Primary(
        key: const Key('pelada-review'),
        label: 'Revisar placar',
        onTap: onEdit,
      );
    } else if (saved.awaitsResponseFrom(uid)) {
      row = Row(
        children: [
          Expanded(
            flex: 2,
            child: _Secondary(
              key: const Key('pelada-dispute'),
              label: 'Contestar',
              onTap: onDispute,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: _Primary(
              key: const Key('pelada-confirm'),
              label: 'Confirmar placar',
              onTap: onConfirm,
            ),
          ),
        ],
      );
    } else if (canEdit) {
      row = Row(
        children: [
          Expanded(
            flex: 2,
            child: _Secondary(
              key: const Key('pelada-edit'),
              label: 'Editar placar',
              onTap: onEdit,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: _Primary(
              key: const Key('pelada-share'),
              label: 'Compartilhar resultado',
              onTap: onShare,
            ),
          ),
        ],
      );
    } else {
      row = _Primary(
        key: const Key('pelada-share'),
        label: 'Compartilhar resultado',
        onTap: onShare,
      );
    }
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: row,
      ),
    );
  }
}

class _Primary extends StatelessWidget {
  const _Primary({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: const Color(0xFF0A0A0A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: AppTypography.soraRegular(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: FittedBox(fit: BoxFit.scaleDown, child: Text(label)),
      ),
    );
  }
}

class _Secondary extends StatelessWidget {
  const _Secondary({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: 54,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.onSurface,
          side: BorderSide(color: colors.onSurface.withValues(alpha: 0.16)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: FittedBox(fit: BoxFit.scaleDown, child: Text(label)),
      ),
    );
  }
}

/// Folha "Contestar": motivo rápido (chip) e/ou texto livre — um dos dois é
/// obrigatório. Devolve o motivo pronto para a callable.
class PeladaDisputeSheet extends StatefulWidget {
  const PeladaDisputeSheet({super.key, required this.creatorName});

  final String creatorName;

  @override
  State<PeladaDisputeSheet> createState() => _PeladaDisputeSheetState();
}

class _PeladaDisputeSheetState extends State<PeladaDisputeSheet> {
  String? _chip;
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reason = peladaDisputeReason(chip: _chip, text: _text.text);
    final creator = widget.creatorName.trim().split(RegExp(r'\s+')).first;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Contestar o placar',
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$creator recebe o motivo para corrigir. Até lá, a pelada não '
              'conta.',
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
                color: PeladaStyle.dim(colors),
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in kPeladaDisputeReasons)
                  BookingStoryChip(
                    key: Key('pelada-dispute-reason-$r'),
                    label: r,
                    selected: _chip == r,
                    onTap: () => setState(() => _chip = _chip == r ? null : r),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('pelada-dispute-text'),
              controller: _text,
              onChanged: (_) => setState(() {}),
              maxLength: 120,
              maxLines: 2,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Ou escreva o que está errado',
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                key: const Key('pelada-dispute-send'),
                onPressed: reason == null
                    ? null
                    : () => Navigator.of(context).pop(reason),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.live,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text('Enviar contestação'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
