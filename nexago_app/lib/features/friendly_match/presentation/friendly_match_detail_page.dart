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
import 'widgets/friendly_match_detail_sections.dart';
import 'widgets/friendly_match_review_sheet.dart';

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
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        centerTitle: false,
        leadingWidth: 52,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Center(
            child: Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () => context.pop(),
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    Icons.chevron_left_rounded,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
        title: Text(
          'Convite',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.3,
              ),
        ),
      ),
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
    final now = DateTime.now();
    final action = nextActionFor(uid, match, now);
    final dateFormat = DateFormat("EEEE, d 'de' MMMM · HH:mm", 'pt_BR');

    // Proposta vigente (contraproposta substitui a original na exibição).
    final counter = match.counterProposal;
    final effectiveTime =
        match.status == FriendlyMatchStatus.countered && counter != null
            ? counter.scheduledAt
            : match.scheduledAt;
    final effectiveLocation = (match.status == FriendlyMatchStatus.countered &&
            counter?.location != null)
        ? counter!.location!.displayLabel
        : match.location.displayLabel;

    final whenLabel = friendlyMatchDetailWhenLabel(effectiveTime);
    final alternativeWhenLabels = match.status.isPendingResponse &&
            match.alternativeTimes.isNotEmpty &&
            counter == null
        ? match.alternativeTimes
            .map((alt) => dateFormat.format(alt.toLocal()).replaceAll('.', ''))
            .toList()
        : const <String>[];

    final timelineSteps = friendlyMatchTimelineSteps(
      match: match,
      uid: uid,
      action: action,
      now: now,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        FriendlyMatchDetailProfileCard(match: match, uid: uid),
        const SizedBox(height: 12),
        FriendlyMatchDetailInfoCard(
          whenLabel: whenLabel,
          locationLabel: effectiveLocation,
          alternativeWhenLabels: alternativeWhenLabels,
          counterMessage: match.status == FriendlyMatchStatus.countered
              ? counter?.message
              : null,
        ),
        if (match.message != null &&
            match.message!.isNotEmpty &&
            match.status != FriendlyMatchStatus.countered) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: colors.outline.withValues(alpha: 0.12),
              ),
            ),
            child: Text(
              '“${match.message}”',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontStyle: FontStyle.italic,
                    color: colors.onSurfaceMuted,
                  ),
            ),
          ),
        ],
        if (timelineSteps.isNotEmpty) ...[
          const SizedBox(height: 12),
          FriendlyMatchDetailTimeline(steps: timelineSteps),
        ],
        const SizedBox(height: 16),
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
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: busy ? null : () => onAccept(null),
            child: const Text(
              'Aceitar e confirmar jogo',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),
          if (match.status == FriendlyMatchStatus.sent) ...[
            OutlinedButton(
              onPressed: busy ? null : onCounter,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Sugerir outro horário',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: 8),
          ],
          TextButton(
            onPressed: busy ? null : onDecline,
            child: Text(
              'Recusar',
              style: TextStyle(
                color: theme.colorScheme.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ];

      case FriendlyMatchNextAction.waitingResponse:
        return [
          FriendlyMatchDetailOutlineButton(
            label: match.status == FriendlyMatchStatus.countered
                ? 'Retirar contraproposta'
                : 'Retirar convite',
            onPressed: onCancel,
            busy: busy,
            destructive: true,
          ),
        ];

      case FriendlyMatchNextAction.expired:
        return [
          _Hint(text: 'Este convite expirou sem resposta. Bora tentar de novo?'),
        ];

      case FriendlyMatchNextAction.waitingCheckInWindow:
        return [
          if (match.location.hasArena)
            OutlinedButton.icon(
              onPressed: () =>
                  GoRouter.of(context).push('/arena/${match.location.arenaId}'),
              icon: const Icon(Icons.stadium_outlined, size: 18),
              label: const Text('Reservar quadra na arena'),
            ),
          if (match.location.hasArena) const SizedBox(height: 8),
          FriendlyMatchDetailOutlineButton(
            label: 'Cancelar jogo',
            onPressed: onCancel,
            busy: busy,
            destructive: true,
          ),
        ];

      case FriendlyMatchNextAction.checkInAvailable:
        return [
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: busy ? null : onCheckIn,
            icon: const Icon(Icons.where_to_vote_rounded),
            label: const Text(
              'Fazer check-in — cheguei!',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 8),
          FriendlyMatchDetailOutlineButton(
            label: 'Cancelar jogo',
            onPressed: onCancel,
            busy: busy,
            destructive: true,
          ),
        ];

      case FriendlyMatchNextAction.checkInWaitingOther:
        return const [];

      case FriendlyMatchNextAction.review:
        return [
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: busy ? null : onReview,
            icon: const Icon(Icons.star_rounded),
            label: Text(
              'Avaliar ${match.otherName(uid)}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ];

      case FriendlyMatchNextAction.reviewWaitingOther:
        return const [];

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
