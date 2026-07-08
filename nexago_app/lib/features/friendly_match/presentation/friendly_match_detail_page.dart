import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/observability/analytics_service.dart';
import '../domain/friendly_match_logic.dart';
import '../domain/friendly_match_models.dart';
import '../domain/friendly_match_providers.dart';
import 'widgets/friendly_match_counter_sheet.dart';
import 'widgets/friendly_match_review_sheet.dart';
import 'widgets/friendly_match_status_chip.dart';

/// Detalhe do jogo — uma tela única que se adapta por status e papel:
/// responder convite, aguardar, check-in, cancelar, avaliar, ver resultado.
class FriendlyMatchDetailPage extends ConsumerStatefulWidget {
  const FriendlyMatchDetailPage({super.key, required this.matchId});

  final String matchId;

  @override
  ConsumerState<FriendlyMatchDetailPage> createState() =>
      _FriendlyMatchDetailPageState();
}

class _FriendlyMatchDetailPageState
    extends ConsumerState<FriendlyMatchDetailPage> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, {String? success}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && success != null) showAppSnackBar(context, success);
    } on FriendlyMatchActionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível concluir a ação.',
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmCancel(FriendlyMatch match) async {
    final config = ref.read(friendlyMatchConfigProvider).value ??
        FriendlyMatchConfig.defaults;
    final penalized = match.status == FriendlyMatchStatus.confirmed &&
        cancellationIsPenalized(match, config, DateTime.now());
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(match.status == FriendlyMatchStatus.confirmed
            ? 'Cancelar jogo?'
            : 'Retirar convite?'),
        content: Text(penalized
            ? 'Faltam menos de ${config.cancellationPenaltyWindowHours}h para o '
                'jogo — cancelar agora afeta sua reputação.'
            : 'O outro atleta será avisado.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(penalized ? 'Cancelar mesmo assim' : 'Confirmar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(
      () => ref.read(friendlyMatchServiceProvider).cancelMatch(match.id),
      success: 'Cancelado.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final matchAsync = ref.watch(friendlyMatchProvider(widget.matchId));
    final uid = ref.watch(authProvider).value?.uid ?? '';

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: NexaAppBar(title: const Text('Bora Jogar')),
      body: matchAsync.when(
        loading: () => const AppLoadingView(),
        error: (_, __) =>
            const AppInlineErrorView(message: 'Não foi possível carregar o jogo.'),
        data: (match) {
          if (match == null || !match.isParticipant(uid)) {
            return const AppInlineErrorView(
                message: 'Jogo não encontrado ou você não participa dele.');
          }
          return _MatchBody(
            match: match,
            uid: uid,
            busy: _busy,
            onAccept: (chosenTime) => _run(
              () async {
                await ref
                    .read(friendlyMatchServiceProvider)
                    .acceptInvite(match.id, chosenTime: chosenTime);
                await ref
                    .read(analyticsServiceProvider)
                    .logFriendlyMatchInviteAccepted(
                      wasCounter:
                          match.status == FriendlyMatchStatus.countered,
                    );
              },
              success: 'Deu match! Jogo confirmado 🎉',
            ),
            onDecline: () => _run(
              () =>
                  ref.read(friendlyMatchServiceProvider).declineInvite(match.id),
              success: 'Convite recusado.',
            ),
            onCounter: () async {
              final result = await showFriendlyMatchCounterSheet(
                context,
                initialTime: match.scheduledAt.toLocal(),
              );
              if (result == null) return;
              await _run(
                () => ref.read(friendlyMatchServiceProvider).counterInvite(
                      matchId: match.id,
                      scheduledAt: result.scheduledAt,
                      message: result.message,
                    ),
                success: 'Contraproposta enviada.',
              );
            },
            onCancel: () => _confirmCancel(match),
            onCheckIn: () => _run(
              () async {
                final completed =
                    await ref.read(friendlyMatchServiceProvider).checkIn(match.id);
                await ref
                    .read(analyticsServiceProvider)
                    .logFriendlyMatchCheckedIn();
                if (mounted && completed) {
                  showAppSnackBar(context, 'Jogo confirmado pelos dois! 🙌');
                }
              },
              success: null,
            ),
            onReview: () async {
              final result = await showFriendlyMatchReviewSheet(
                context,
                otherName: match.otherName(uid),
              );
              if (result == null) return;
              await _run(
                () async {
                  await ref.read(friendlyMatchServiceProvider).submitReview(
                        matchId: match.id,
                        stars: result.stars,
                        tags: result.tags,
                        comment: result.comment,
                      );
                  await ref
                      .read(analyticsServiceProvider)
                      .logFriendlyMatchReviewSubmitted(stars: result.stars);
                },
                success: 'Avaliação enviada. Fica oculta até o outro avaliar.',
              );
            },
          );
        },
      ),
    );
  }
}

class _MatchBody extends StatelessWidget {
  const _MatchBody({
    required this.match,
    required this.uid,
    required this.busy,
    required this.onAccept,
    required this.onDecline,
    required this.onCounter,
    required this.onCancel,
    required this.onCheckIn,
    required this.onReview,
  });

  final FriendlyMatch match;
  final String uid;
  final bool busy;
  final void Function(DateTime? chosenTime) onAccept;
  final VoidCallback onDecline;
  final VoidCallback onCounter;
  final VoidCallback onCancel;
  final VoidCallback onCheckIn;
  final VoidCallback onReview;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final now = DateTime.now();
    final action = nextActionFor(uid, match, now);
    final otherName = match.otherName(uid);
    final dateFormat = DateFormat("EEEE, d 'de' MMMM • HH:mm", 'pt_BR');
    final scoreLabel = compatibilityLabel(match.scoreAtSend);

    // Proposta vigente (contraproposta substitui a original na exibição).
    final counter = match.counterProposal;
    final effectiveTime =
        match.status == FriendlyMatchStatus.countered && counter != null
            ? counter.scheduledAt
            : match.scheduledAt;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Cabeçalho: com quem, objetivo, status.
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: AppColors.brand.withValues(alpha: 0.12),
                    backgroundImage: match.otherPhotoUrl(uid) != null
                        ? NetworkImage(match.otherPhotoUrl(uid)!)
                        : null,
                    child: match.otherPhotoUrl(uid) == null
                        ? Text(
                            otherName.isNotEmpty
                                ? otherName[0].toUpperCase()
                                : '?',
                            style: theme.textTheme.titleLarge?.copyWith(
                              color: AppColors.brand,
                              fontWeight: FontWeight.w800,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          otherName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          match.objective.label,
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: colors.onSurfaceMuted),
                        ),
                      ],
                    ),
                  ),
                  FriendlyMatchStatusChip(
                    status: match.status,
                    clientExpired: isClientExpired(match, now),
                  ),
                ],
              ),
              if (scoreLabel != null) ...[
                const SizedBox(height: 12),
                FriendlyMatchScoreBadge(label: scoreLabel),
              ],
              if (match.message != null && match.message!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  '“${match.message}”',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontStyle: FontStyle.italic,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Proposta: quando e onde.
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _InfoRow(
                icon: Icons.event_rounded,
                text: dateFormat.format(effectiveTime.toLocal()),
              ),
              if (match.status.isPendingResponse &&
                  match.alternativeTimes.isNotEmpty &&
                  counter == null)
                for (final alt in match.alternativeTimes)
                  _InfoRow(
                    icon: Icons.more_time_rounded,
                    text: 'Alternativa: ${dateFormat.format(alt.toLocal())}',
                  ),
              _InfoRow(
                icon: Icons.place_outlined,
                text: (match.status == FriendlyMatchStatus.countered &&
                        counter?.location != null)
                    ? counter!.location!.displayLabel
                    : match.location.displayLabel,
              ),
              if (match.status == FriendlyMatchStatus.countered &&
                  counter?.message != null)
                _InfoRow(
                  icon: Icons.chat_bubble_outline_rounded,
                  text: '“${counter!.message}”',
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Área de ação adaptativa.
        ..._actionArea(context, action, counter, effectiveTime),

        // Avaliações reveladas.
        if (match.status == FriendlyMatchStatus.reviewed &&
            match.reviews.isNotEmpty) ...[
          const SizedBox(height: 16),
          _RevealedReviews(match: match, uid: uid),
        ],
      ],
    );
  }

  List<Widget> _actionArea(
    BuildContext context,
    FriendlyMatchNextAction action,
    FriendlyMatchCounterProposal? counter,
    DateTime effectiveTime,
  ) {
    final colors = context.themeColors;
    final theme = Theme.of(context);

    switch (action) {
      case FriendlyMatchNextAction.respond:
        final choices = [
          effectiveTime,
          if (match.status == FriendlyMatchStatus.sent)
            ...match.alternativeTimes,
        ];
        return [
          if (choices.length > 1)
            _Hint(
              text:
                  'Há mais de um horário proposto — o principal será confirmado. '
                  'Para outro horário, use "Sugerir outro".',
            ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: busy ? null : () => onAccept(null),
            child: const Text('Aceitar e confirmar jogo'),
          ),
          const SizedBox(height: 8),
          if (match.status == FriendlyMatchStatus.sent) ...[
            OutlinedButton(
              onPressed: busy ? null : onCounter,
              child: const Text('Sugerir outro horário'),
            ),
            const SizedBox(height: 8),
          ],
          TextButton(
            onPressed: busy ? null : onDecline,
            child: Text(
              'Recusar',
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ),
        ];

      case FriendlyMatchNextAction.waitingResponse:
        return [
          _Hint(
            text: match.status == FriendlyMatchStatus.countered
                ? 'Sua contraproposta foi enviada. Aguardando resposta.'
                : 'Convite enviado. Aguardando resposta de ${match.otherName(uid)}.',
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: Text('Retirar convite',
                style: TextStyle(color: theme.colorScheme.error)),
          ),
        ];

      case FriendlyMatchNextAction.expired:
        return [
          _Hint(text: 'Este convite expirou sem resposta. Bora tentar de novo?'),
        ];

      case FriendlyMatchNextAction.waitingCheckInWindow:
        return [
          _Hint(
            text: 'Jogo confirmado! O check-in abre 30 minutos antes do horário. '
                'Sem check-in dos dois, o jogo não conta nem libera avaliação.',
          ),
          const SizedBox(height: 8),
          if (match.location.hasArena)
            OutlinedButton.icon(
              onPressed: () =>
                  GoRouter.of(context).push('/arena/${match.location.arenaId}'),
              icon: const Icon(Icons.stadium_outlined, size: 18),
              label: const Text('Reservar quadra na arena'),
            ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: Text('Cancelar jogo',
                style: TextStyle(color: theme.colorScheme.error)),
          ),
        ];

      case FriendlyMatchNextAction.checkInAvailable:
        return [
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: busy ? null : onCheckIn,
            icon: const Icon(Icons.where_to_vote_rounded),
            label: const Text('Fazer check-in — cheguei!'),
          ),
          const SizedBox(height: 8),
          _Hint(
            text:
                'O jogo só conta quando os DOIS fazem check-in dentro da janela.',
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: Text('Cancelar jogo',
                style: TextStyle(color: theme.colorScheme.error)),
          ),
        ];

      case FriendlyMatchNextAction.checkInWaitingOther:
        return [
          _Hint(
            text: 'Check-in feito ✔ Aguardando o check-in de '
                '${match.otherName(uid)} para validar o jogo.',
          ),
        ];

      case FriendlyMatchNextAction.review:
        return [
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            onPressed: busy ? null : onReview,
            icon: const Icon(Icons.star_rounded),
            label: Text('Avaliar ${match.otherName(uid)}'),
          ),
          const SizedBox(height: 8),
          _Hint(
            text: 'Avaliação double-blind: sua nota fica oculta até o outro '
                'avaliar (ou o prazo vencer).',
          ),
        ];

      case FriendlyMatchNextAction.reviewWaitingOther:
        return [
          _Hint(
            text: 'Avaliação enviada. As notas serão reveladas quando '
                '${match.otherName(uid)} avaliar ou o prazo vencer.',
          ),
        ];

      case FriendlyMatchNextAction.finished:
        final text = switch (match.status) {
          FriendlyMatchStatus.declined => 'Convite recusado.',
          FriendlyMatchStatus.cancelled => match.cancelledByUid == uid
              ? 'Você cancelou este jogo.'
              : '${match.nameOf(match.cancelledByUid ?? '')} cancelou este jogo.',
          FriendlyMatchStatus.noShow => match.noShowUids.contains(uid)
              ? 'Jogo encerrado sem o seu check-in — isso afeta sua reputação.'
              : match.noShowUids.isEmpty
                  ? 'Jogo encerrado sem check-in dos dois lados.'
                  : '${match.otherName(uid)} não fez check-in. Bora buscar outro jogo?'
          ,
          FriendlyMatchStatus.reviewed => 'Jogo concluído. Boa! 🙌',
          _ => 'Este jogo foi encerrado.',
        };
        return [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              text,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ];
    }
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.brand),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colors.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: colors.onSurface),
      ),
    );
  }
}

class _RevealedReviews extends StatelessWidget {
  const _RevealedReviews({required this.match, required this.uid});

  final FriendlyMatch match;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final received = match.reviews[match.otherUid(uid)];
    final sent = match.reviews[uid];

    Widget stars(int count) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 1; i <= 5; i++)
              Icon(
                i <= count ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 18,
                color: const Color(0xFFB98900),
              ),
          ],
        );

    Widget reviewTile(String title, FriendlyMatchReview? review) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: colors.onSurfaceMuted)),
            const SizedBox(height: 4),
            if (review == null)
              Text('Sem avaliação.',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: colors.onSurfaceMuted))
            else ...[
              stars(review.stars),
              if (review.comment != null && review.comment!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('“${review.comment}”',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontStyle: FontStyle.italic,
                        color: colors.onSurfaceMuted,
                      )),
                ),
            ],
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Avaliações',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          reviewTile('Você recebeu', received),
          reviewTile('Você enviou', sent),
        ],
      ),
    );
  }
}
