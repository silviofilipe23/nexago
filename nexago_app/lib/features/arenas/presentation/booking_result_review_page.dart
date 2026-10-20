import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/booking_result.dart';
import '../domain/booking_result_record.dart';
import '../domain/booking_result_record_providers.dart';
import '../domain/booking_story.dart';
import 'booking_result_page.dart';
import 'widgets/booking_story/booking_result_card.dart';
import 'widgets/booking_story/booking_story_editor.dart';

/// Conferir o placar do pós-jogo (push "Placar para confirmar" e Histórico).
/// O adversário com conta confirma ou contesta; os outros veem o estado. Quem
/// lançou pode reabrir o pós-jogo para corrigir enquanto não confirmaram.
class BookingResultReviewPage extends ConsumerStatefulWidget {
  const BookingResultReviewPage({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<BookingResultReviewPage> createState() =>
      _BookingResultReviewPageState();
}

class _BookingResultReviewPageState
    extends ConsumerState<BookingResultReviewPage> {
  /// Resposta em envio: `true` confirmando, `false` contestando.
  bool? _sending;
  bool get _busy => _sending != null;

  Future<void> _respond(SavedBookingResult saved,
      {required bool confirm}) async {
    if (!confirm) {
      final creator = saved.createdByName.trim().split(RegExp(r'\s+')).first;
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Contestar o placar?'),
          content: Text(
            '$creator recebe o aviso para corrigir e enviar de novo. '
            'Até lá, o placar não conta no histórico.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Voltar'),
            ),
            FilledButton(
              key: const Key('booking-result-dispute-confirm'),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Contestar'),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _sending = confirm);
    try {
      await ref.read(bookingResultRepositoryProvider).respond(
            saved.bookingId,
            confirm: confirm,
            version: saved.version,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        confirm ? 'Placar confirmado.' : 'Placar contestado.',
      );
    } catch (e) {
      if (mounted) showAppErrorSnackBar(context, e);
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final uid = ref.watch(bookingResultUidProvider);
    final loaded = ref.watch(myBookingResultsLoadedProvider);
    final saved = ref.watch(savedBookingResultProvider(widget.bookingId));
    final canRespond = saved != null && saved.awaitsResponseFrom(uid);
    final canEdit =
        saved != null && saved.createdBy == uid && !saved.isConfirmed;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Conferir placar',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar: canRespond || canEdit
          ? SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                child: canRespond
                    ? Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: _ActionButton(
                              key: const Key('booking-result-dispute'),
                              label: 'Contestar',
                              outlined: true,
                              busy: _sending == false,
                              onPressed: () {
                                if (!_busy) _respond(saved, confirm: false);
                              },
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            flex: 3,
                            child: _ActionButton(
                              key: const Key('booking-result-confirm'),
                              label: 'Confirmar placar',
                              busy: _sending == true,
                              // Fica laranja com o spinner; o toque repetido
                              // é ignorado aqui.
                              onPressed: () {
                                if (!_busy) _respond(saved, confirm: true);
                              },
                            ),
                          ),
                        ],
                      )
                    : _ActionButton(
                        key: const Key('booking-result-review-edit'),
                        label: 'Editar placar',
                        onPressed: () =>
                            openBookingResult(context, saved.toStoryArgs()),
                      ),
              ),
            )
          : null,
      body: saved == null
          ? Center(
              child: loaded
                  ? Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        'Placar não encontrado. Ele pode ter sido corrigido '
                        'sem você nos times.',
                        key: const Key('booking-result-review-missing'),
                        textAlign: TextAlign.center,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    )
                  : const CircularProgressIndicator(color: AppColors.brand),
            )
          : _ReviewBody(saved: saved, uid: uid),
    );
  }
}

class _ReviewBody extends StatelessWidget {
  const _ReviewBody({required this.saved, required this.uid});

  final SavedBookingResult saved;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = saved.result;
    final story = bookingStoryDataFrom(
      arenaName: saved.arenaName,
      courtName: saved.courtName ?? '',
      dateKey: saved.dateKey,
      startTime: saved.startTime,
      endTime: saved.endTime,
    );
    final place = story.courtName.isEmpty
        ? story.arenaName
        : '${story.arenaName} · ${story.courtName}';
    final mine = r.teamOfPlayer(uid)?.id;
    final leader = r.leaderId;
    final unit = r.isRotation ? 'JOGO' : 'SET';

    return ListView(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                saved.createdBy == uid
                    ? 'Você lançou o placar'
                    : '${saved.createdByName} lançou o placar',
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$place · ${story.dateLabel} · ${story.timeRange}',
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurface.withValues(alpha: 0.62),
                ),
              ),
              const SizedBox(height: 12),
              BookingResultStatusBadge.forViewer(saved: saved, uid: uid),
            ],
          ),
        ),
        BookingStorySectionLabel(r.isRotation ? 'Classificação' : 'Resultado'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: _Card(
            child: Column(
              children: [
                for (final (i, s) in r.standings.indexed) ...[
                  if (i > 0)
                    Divider(
                      height: 1,
                      color: colors.onSurface.withValues(alpha: 0.06),
                    ),
                  _TeamRow(
                    standing: s,
                    rank: r.isRotation ? i + 1 : null,
                    leading: s.team.id == leader,
                    isMine: s.team.id == mine,
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        BookingStorySectionLabel(r.isRotation ? 'Jogos' : 'Sets'),
        for (final (i, g) in r.games.indexed)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: _Card(
              child: Row(
                children: [
                  SizedBox(
                    width: 56,
                    child: Text(
                      '$unit ${i + 1}',
                      style: AppTypography.mono(
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: colors.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      '${r.teamById(g.teamA)?.name ?? '—'}  ×  '
                      '${r.teamById(g.teamB)?.name ?? '—'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurface.withValues(alpha: 0.75),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${g.scoreA}–${g.scoreB}',
                    style: AppTypography.mono(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({
    required this.standing,
    required this.rank,
    required this.leading,
    required this.isMine,
  });

  final ResultStanding standing;
  final int? rank;
  final bool leading;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          if (rank != null)
            SizedBox(
              width: 18,
              child: Text(
                '$rank',
                style: AppTypography.mono(
                  fontSize: 12,
                  color: colors.onSurface.withValues(alpha: 0.45),
                ),
              ),
            ),
          ResultTeamAvatars(
            players: standing.team.players,
            size: 28,
            borderColor: colors.surfaceCard,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isMine ? '${standing.team.name} (você)' : standing.team.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: leading ? FontWeight.w700 : FontWeight.w500,
                color: leading
                    ? colors.onSurface
                    : colors.onSurface.withValues(alpha: 0.70),
              ),
            ),
          ),
          Text(
            '${standing.wins}',
            style: AppTypography.mono(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: leading
                  ? AppColors.brand
                  : colors.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: child,
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.outlined = false,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool outlined;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final shape =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(16));
    final textStyle = AppTypography.soraRegular(
      fontSize: 15,
      fontWeight: FontWeight.w700,
    );
    if (outlined) {
      return SizedBox(
        height: 54,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: context.themeColors.onSurface,
            side: BorderSide(
              color: context.themeColors.onSurface.withValues(alpha: 0.18),
              width: 1.5,
            ),
            shape: shape,
            textStyle: textStyle,
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          child: busy
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: context.themeColors.onSurface,
                  ),
                )
              : Text(label, maxLines: 1),
        ),
      );
    }
    return SizedBox(
      height: 54,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: const Color(0xFF0A0A0A),
          shape: shape,
          textStyle: textStyle,
          padding: const EdgeInsets.symmetric(horizontal: 12),
        ),
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: Color(0xFF0A0A0A),
                ),
              )
            : Text(label, maxLines: 1),
      ),
    );
  }
}
