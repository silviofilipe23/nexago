import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../data/arena_clubs_repository.dart';
import '../domain/arena_club_providers.dart';
import '../domain/arena_club_session.dart';

/// Sessão do Clubinho (atleta): lista pública ao vivo + entrar/sair com PIX.
class ClubSessionDetailPage extends ConsumerStatefulWidget {
  const ClubSessionDetailPage({super.key, required this.sessionId});

  final String sessionId;

  @override
  ConsumerState<ClubSessionDetailPage> createState() =>
      _ClubSessionDetailPageState();
}

class _ClubSessionDetailPageState extends ConsumerState<ClubSessionDetailPage> {
  bool _leaving = false;

  static final _fullDateFmt = DateFormat('EEE, dd/MM', 'pt_BR');

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(clubSessionProvider(widget.sessionId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: sessionAsync.when(
          data: (session) {
            if (session == null) {
              return AppEmptyView(
                icon: Icons.groups_outlined,
                title: 'Sessão não encontrada',
                subtitle: 'Este clubinho pode ter sido removido.',
                actionLabel: 'Voltar',
                onAction: () => context.pop(),
              );
            }
            return _buildBody(context, session);
          },
          loading: () =>
              const AppLoadingView(message: 'Carregando clubinho...'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () =>
                ref.invalidate(clubSessionProvider(widget.sessionId)),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, ArenaClubSession session) {
    final theme = Theme.of(context);
    final uid = ref.watch(authProvider).valueOrNull?.uid;
    final myParticipant =
        ref.watch(myClubParticipantProvider(widget.sessionId)).valueOrNull;
    final participants = ref
            .watch(clubSessionParticipantsProvider(widget.sessionId))
            .valueOrNull ??
        const <ClubParticipant>[];
    final confirmed =
        participants.where((p) => p.isConfirmed).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Header(
          eyebrow: session.arenaName.toUpperCase(),
          title: session.clubName,
          onBack: () => context.pop(),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              FadeSlideIn(child: _SessionHeroCard(session: session)),
              if (session.isCanceled) ...[
                const SizedBox(height: 16),
                const _CanceledBanner(),
              ],
              if (session.description != null) ...[
                const SizedBox(height: 16),
                Text(
                  session.description!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.4,
                  ),
                ),
              ],
              const SizedBox(height: 28),
              Text(
                'QUEM VAI (${confirmed.length}/${session.capacity})',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 12),
              if (confirmed.isEmpty)
                Text(
                  'Ninguém confirmado ainda. Seja o primeiro a entrar!',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                )
              else
                for (final p in confirmed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _ParticipantTile(
                      participant: p,
                      isMe: uid != null && p.athleteId == uid,
                    ),
                  ),
            ],
          ),
        ),
        _BottomCta(
          session: session,
          myParticipant: myParticipant,
          leaving: _leaving,
          onJoin: () => _goToPix(session),
          onLeave: () => _confirmLeave(session),
        ),
      ],
    );
  }

  void _goToPix(ArenaClubSession session) {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) {
      showAppSnackBar(
        context,
        'Faça login para entrar na lista.',
        isError: true,
      );
      return;
    }
    context.pushNamed(
      AppRouteNames.clubSessionPix,
      pathParameters: {'sessionId': widget.sessionId},
    );
  }

  Future<void> _confirmLeave(ArenaClubSession session) async {
    final me =
        ref.read(myClubParticipantProvider(widget.sessionId)).valueOrNull;
    final isOnsite = me?.isConfirmed == true && me?.isOnsite == true;
    final now = DateTime.now();

    final bool canLeave;
    final String dialogMessage;
    if (isOnsite) {
      // Vaga "paga na arena": sem dinheiro envolvido — sai até o início.
      final start = session.startAt;
      canLeave = start == null || now.isBefore(start);
      dialogMessage = canLeave
          ? 'Sair agora libera sua vaga. Confirmar?'
          : 'Esta sessão já começou — não dá mais para sair da lista. '
              'Fale com a arena.';
    } else {
      final withRefund = session.canLeaveWithRefund(now);
      final deadline = session.cancelDeadline;
      final deadlineLabel = deadline != null
          ? '${_fullDateFmt.format(deadline)} às '
              '${deadline.hour.toString().padLeft(2, '0')}:'
              '${deadline.minute.toString().padLeft(2, '0')}'
          : null;
      canLeave = withRefund;
      dialogMessage = withRefund
          ? 'Você sai da lista desta sessão e o valor pago '
              '(${formatBRL(session.priceReais)}) é estornado '
              'automaticamente no PIX.'
          : 'O prazo para sair com estorno automático '
              '(${session.cancelWindowHours}h antes do início'
              '${deadlineLabel != null ? ' — até $deadlineLabel' : ''}) '
              'já passou. Fale com a arena.';
    }

    final confirmedLeave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: const Text('Sair da lista?'),
        content: Text(dialogMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          if (canLeave)
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(backgroundColor: AppColors.live),
              child: const Text('Sair da lista'),
            ),
        ],
      ),
    );
    if (confirmedLeave != true || !mounted) return;

    setState(() => _leaving = true);
    try {
      final result = await ref
          .read(arenaClubsRepositoryProvider)
          .leaveSession(sessionId: widget.sessionId);
      if (!mounted) return;
      showAppSnackBar(
        context,
        result.refunded
            ? 'Você saiu da lista. O estorno do PIX foi solicitado.'
            : 'Você saiu da lista.',
      );
    } on ArenaClubException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.eyebrow,
    required this.title,
    required this.onBack,
  });

  final String eyebrow;
  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              child: SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  eyebrow,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _SessionHeroCard extends StatelessWidget {
  const _SessionHeroCard({required this.session});

  final ArenaClubSession session;

  static final _dateFmt = DateFormat('EEEE, dd/MM', 'pt_BR');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = session.dateOnly;
    final dateLabel = date != null
        ? _capitalize(_dateFmt.format(date))
        : session.dateShortLabel;
    final courts = session.courtNames.isNotEmpty
        ? session.courtNames.join(' · ')
        : 'Quadras a definir';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.groups_rounded,
                    color: AppColors.brand,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dateLabel,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        session.timeRangeLabel,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _InfoRow(icon: Icons.sports_volleyball_outlined, label: courts),
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.schedule_rounded,
              label: 'Saída com estorno até ${session.cancelWindowHours}h '
                  'antes do início',
            ),
            if (session.allowOnsitePayment) ...[
              const SizedBox(height: 8),
              const _InfoRow(
                icon: Icons.storefront_outlined,
                label: 'Pague antecipado no PIX ou direto na arena no dia',
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: context.themeColors.onSurfaceMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.35,
                ),
          ),
        ),
      ],
    );
  }
}

class _CanceledBanner extends StatelessWidget {
  const _CanceledBanner();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.live.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.4)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            const Icon(Icons.event_busy_rounded,
                color: AppColors.live, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Sessão cancelada pela arena. Pagamentos confirmados são '
                'estornados automaticamente.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ParticipantTile extends StatelessWidget {
  const _ParticipantTile({required this.participant, required this.isMe});

  final ClubParticipant participant;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final photo = participant.athletePhotoUrl;
    final initial = participant.athleteName.trim().isNotEmpty
        ? participant.athleteName.trim()[0].toUpperCase()
        : '?';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.brand.withValues(alpha: 0.18),
              foregroundImage: photo != null ? NetworkImage(photo) : null,
              child: Text(
                initial,
                style: const TextStyle(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                isMe
                    ? '${participant.athleteName} (você)'
                    : participant.athleteName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurface,
                  fontWeight: isMe ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ),
            const Icon(
              Icons.check_circle_rounded,
              size: 18,
              color: AppColors.win,
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomCta extends StatelessWidget {
  const _BottomCta({
    required this.session,
    required this.myParticipant,
    required this.leaving,
    required this.onJoin,
    required this.onLeave,
  });

  final ArenaClubSession session;
  final ClubParticipant? myParticipant;
  final bool leaving;
  final VoidCallback onJoin;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final me = myParticipant;
    final isConfirmed = me?.isConfirmed == true;
    final isPending = me?.isPendingPayment == true;

    Widget action;
    if (session.isCanceled || !session.isScheduled) {
      action = _disabledButton(context, 'Sessão encerrada');
    } else if (isConfirmed) {
      action = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.check_circle_rounded,
                color: AppColors.win,
                size: 18,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  me?.isOnsite == true
                      ? 'Você está na lista — pague na arena no dia'
                      : 'Você está na lista',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.win,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: leaving ? null : onLeave,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.live,
              side: BorderSide(color: AppColors.live.withValues(alpha: 0.5)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: leaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'Sair da lista',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ],
      );
    } else if (isPending) {
      action = FilledButton(
        onPressed: onJoin,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: const Text(
          'Continuar pagamento',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      );
    } else if (session.isFull) {
      action = _disabledButton(context, 'Lista cheia');
    } else {
      action = FilledButton(
        onPressed: onJoin,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
        child: const Text(
          'Entrar na lista',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          formatBRL(session.priceReais),
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                        Text(
                          session.allowOnsitePayment
                              ? 'por atleta · PIX ou pague na arena'
                              : 'por atleta · PIX antecipado',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    session.isFull
                        ? 'Lista cheia'
                        : '${session.spotsLeft} '
                            'vaga${session.spotsLeft == 1 ? '' : 's'}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: session.isFull
                          ? AppColors.live
                          : AppColors.brand,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              action,
            ],
          ),
        ),
      ),
    );
  }

  Widget _disabledButton(BuildContext context, String label) {
    return FilledButton(
      onPressed: null,
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}
