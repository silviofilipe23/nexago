import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';

class TournamentPartnerInvitePage extends ConsumerStatefulWidget {
  const TournamentPartnerInvitePage({super.key, required this.inviteId});

  final String inviteId;

  @override
  ConsumerState<TournamentPartnerInvitePage> createState() =>
      _TournamentPartnerInvitePageState();
}

class _TournamentPartnerInvitePageState
    extends ConsumerState<TournamentPartnerInvitePage> {
  bool _accepting = false;
  bool _declining = false;

  Future<void> _accept() async {
    if (_accepting) return;
    setState(() => _accepting = true);

    try {
      final uid = ref.read(authProvider).valueOrNull?.uid;
      if (uid == null || uid.isEmpty) {
        if (!mounted) return;
        showAppSnackBar(context, 'Faça login para aceitar o convite.', isError: true);
        return;
      }

      final result = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .acceptInvite(widget.inviteId);

      if (!mounted) return;
      showAppSnackBar(context, 'Convite aceito! Agora pague sua parcela.');

      context.goNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': result.tournamentId},
        queryParameters: {
          'registrationId': result.registrationId,
          'categoryId': result.categoryId,
          'step': 'payment',
        },
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível aceitar o convite.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  Future<void> _decline() async {
    if (_declining) return;
    setState(() => _declining = true);

    try {
      await ref.read(tournamentPartnerInviteServiceProvider).cancelInvite(
            widget.inviteId,
            asDecline: true,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Convite recusado.');
      context.pop();
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _declining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(tournamentPartnerInviteProvider(widget.inviteId));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        title: const Text('Convite de dupla'),
      ),
      body: inviteAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (_, __) => _MessageBody(
          message: 'Não foi possível carregar o convite.',
        ),
        data: (invite) {
          if (invite == null) {
            return const _MessageBody(message: 'Convite não encontrado.');
          }
          if (invite.isExpired) {
            return const _MessageBody(message: 'Este convite expirou.');
          }
          if (invite.isAccepted) {
            return _MessageBody(
              message: 'Convite já aceito.',
              actionLabel: 'Ir para pagamento',
              onAction: () {
                final regId = invite.registrationId;
                if (regId == null || regId.isEmpty) return;
                context.goNamed(
                  AppRouteNames.tournamentRegistration,
                  pathParameters: {'tournamentId': invite.tournamentId},
                  queryParameters: {
                    'registrationId': regId,
                    'categoryId': invite.categoryId,
                    'step': 'payment',
                  },
                );
              },
            );
          }
          if (invite.isDeclined || invite.isCancelled) {
            return const _MessageBody(
              message: 'Este convite não está mais disponível.',
            );
          }

          final tournamentAsync =
              ref.watch(tournamentDetailProvider(invite.tournamentId));

          return tournamentAsync.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
            error: (_, __) => _InviteContent(
              invite: invite,
              tournamentName: 'Torneio',
              accepting: _accepting,
              declining: _declining,
              onAccept: _accept,
              onDecline: _decline,
            ),
            data: (tournament) => _InviteContent(
              invite: invite,
              tournamentName: tournament?.name ?? 'Torneio',
              accepting: _accepting,
              declining: _declining,
              onAccept: _accept,
              onDecline: _decline,
            ),
          );
        },
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.onSurfaceMuted),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 24),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class _InviteContent extends StatelessWidget {
  const _InviteContent({
    required this.invite,
    required this.tournamentName,
    required this.accepting,
    required this.declining,
    required this.onAccept,
    required this.onDecline,
  });

  final TournamentPartnerInvite invite;
  final String tournamentName;
  final bool accepting;
  final bool declining;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inviterFirst = invite.inviterName.split(' ').first;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tournamentName,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Categoria: ${invite.categoryId}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            '$inviterFirst convidou você para formar dupla neste torneio.',
            style: theme.textTheme.titleMedium?.copyWith(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Ao aceitar, vocês poderão pagar cada um sua parcela. A inscrição da dupla é confirmada quando os dois pagarem.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
              height: 1.45,
            ),
          ),
          const Spacer(),
          FilledButton(
            onPressed: accepting || declining ? null : onAccept,
            child: accepting
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Aceitar convite'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: accepting || declining ? null : onDecline,
            child: declining
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Recusar'),
          ),
        ],
      ),
    );
  }
}
