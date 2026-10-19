import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/booking_providers.dart';
import '../domain/booking_invite_model.dart';
import '../domain/booking_invite_providers.dart';
import '../domain/booking_invite_status.dart';

/// Agenda do atleta (aba do shell) — onde o jogo aparece depois do aceite.
const _agendaPath = '${AppRoutes.discover}?tab=agenda';

/// Convite para jogar numa reserva: `/convite/:inviteId`, aberto pelo push,
/// pela home ou pelo link compartilhado (`link_{bookingId}`, multiuso).
class BookingInvitePage extends ConsumerStatefulWidget {
  const BookingInvitePage({super.key, required this.inviteId});

  final String inviteId;

  @override
  ConsumerState<BookingInvitePage> createState() => _BookingInvitePageState();
}

class _BookingInvitePageState extends ConsumerState<BookingInvitePage> {
  bool _responding = false;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).valueOrNull;

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: NexaAppBar(title: const Text('Convite para jogar')),
      // Convite e reserva só são legíveis com sessão (rules): sem login, a
      // tela guarda o convite e leva ao login, que volta pra cá.
      body: user == null ? _SignInBody(onSignIn: _signIn) : _content(user.uid),
    );
  }

  Widget _content(String viewerUid) {
    final inviteAsync = ref.watch(bookingInviteStreamProvider(widget.inviteId));
    return inviteAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) =>
          const _MessageBody(message: 'Não foi possível carregar o convite.'),
      data: (invite) {
        if (invite == null) {
          return const _MessageBody(message: 'Convite não encontrado.');
        }
        final bookingAsync = ref.watch(arenaBookingDocProvider(invite.bookingId));
        if (bookingAsync.isLoading && !bookingAsync.hasValue) {
          return const Center(child: CircularProgressIndicator());
        }
        if (bookingAsync.hasError) {
          return const _MessageBody(
            message: 'Não foi possível carregar a reserva.',
          );
        }
        final snap = bookingAsync.valueOrNull;
        final booking = snap != null && snap.exists ? snap.data() : null;
        final gate = resolveBookingInviteGate(
          invite: invite,
          booking: booking,
          viewerUid: viewerUid,
        );
        final players =
            (booking?['confirmedParticipants'] as num?)?.toInt() ?? 1;

        switch (gate.gate) {
          case BookingInviteGate.blocked:
            return _MessageBody(message: gate.message ?? 'Convite indisponível.');
          case BookingInviteGate.signIn:
            return _SignInBody(onSignIn: _signIn);
          case BookingInviteGate.owner:
            return _InviteBody(
              invite: invite,
              players: players,
              title: 'Este jogo é seu',
              subtitle: 'Mande o link para quem vai jogar com você — quem '
                  'tocar confirma a vaga.',
              primaryLabel: 'Voltar',
              primaryIcon: Icons.arrow_back_rounded,
              onPrimary: _leavePage,
            );
          case BookingInviteGate.joined:
            return _InviteBody(
              invite: invite,
              players: players,
              title: 'Você está no jogo!',
              subtitle: 'O jogo já está na sua agenda. Para sair, abra a '
                  'reserva por lá.',
              primaryLabel: 'Ver na agenda',
              primaryIcon: Icons.event_available_rounded,
              onPrimary: () => context.go(_agendaPath),
            );
          case BookingInviteGate.respond:
            final name = invite.invitedByName.trim().isEmpty
                ? 'Um atleta'
                : invite.invitedByName.trim();
            return _InviteBody(
              invite: invite,
              players: players,
              title: 'Você foi convidado!',
              subtitle: '$name quer jogar com você.',
              primaryLabel: _responding ? 'Confirmando...' : 'Quero jogar!',
              primaryIcon: Icons.sports_volleyball_outlined,
              loading: _responding,
              onPrimary: _responding ? null : () => _respond(invite, true),
              secondaryLabel:
                  invite.isShareLink ? 'Agora não' : 'Não vou poder',
              onSecondary: _responding
                  ? null
                  : invite.isShareLink
                      ? _leavePage
                      : () => _respond(invite, false),
            );
        }
      },
    );
  }

  void _signIn() {
    ref.read(pendingInviteIdProvider.notifier).state = widget.inviteId;
    context.go(AppRoutes.login);
  }

  void _leavePage() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.discover);
    }
  }

  Future<void> _respond(BookingInvite invite, bool accept) async {
    if (_responding) return;
    setState(() => _responding = true);
    try {
      final status = await ref
          .read(bookingInviteServiceProvider)
          .respond(invite.id, accept: accept);
      if (!mounted) return;
      if (status == 'declined') {
        showAppSnackBar(context, 'Convite recusado. Avisamos quem te chamou.');
        _leavePage();
        return;
      }
      // Aceite: a tela vira "Você está no jogo!" sozinha (reserva em tempo
      // real com o seu uid em `participantUids`).
      showAppSnackBar(context, 'Tudo certo! Você está no jogo.');
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _responding = false);
    }
  }
}

class _InviteBody extends StatelessWidget {
  const _InviteBody({
    required this.invite,
    required this.players,
    required this.title,
    required this.subtitle,
    required this.primaryLabel,
    required this.primaryIcon,
    required this.onPrimary,
    this.loading = false,
    this.secondaryLabel,
    this.onSecondary,
  });

  final BookingInvite invite;
  final int players;
  final String title;
  final String subtitle;
  final String primaryLabel;
  final IconData primaryIcon;
  final VoidCallback? onPrimary;
  final bool loading;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final dateLabel = _formatDate(invite.date);
    final hourLabel = invite.endTime.isEmpty
        ? invite.startTime
        : '${invite.startTime} – ${invite.endTime}';
    final playersLabel =
        '${players.clamp(1, kBookingMaxPlayers)}/$kBookingMaxPlayers jogadores confirmados';

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        // Cabeçalho colorido
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        // Detalhes da reserva
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                invite.arenaName.isEmpty ? 'Arena' : invite.arenaName,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (invite.courtName.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  invite.courtName,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
              Divider(
                height: 24,
                color: theme.colorScheme.outline.withValues(alpha: 0.15),
              ),
              _InfoRow(icon: Icons.calendar_today_outlined, label: dateLabel),
              const SizedBox(height: 10),
              _InfoRow(icon: Icons.schedule_outlined, label: hourLabel),
              const SizedBox(height: 10),
              _InfoRow(icon: Icons.groups_2_outlined, label: playersLabel),
            ],
          ),
        ),
        const SizedBox(height: 28),
        FilledButton.icon(
          onPressed: onPrimary,
          icon: loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(primaryIcon),
          label: Text(primaryLabel),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        if (secondaryLabel != null) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: onSecondary,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Text(secondaryLabel!),
          ),
        ],
      ],
    );
  }

  String _formatDate(String dateKey) {
    if (dateKey.length < 10) return dateKey;
    final parsed = DateTime.tryParse(dateKey);
    if (parsed == null) return dateKey;
    final formatted = DateFormat(
      "EEEE, d 'de' MMMM 'de' yyyy",
      'pt_BR',
    ).format(parsed);
    return formatted[0].toUpperCase() + formatted.substring(1);
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: child,
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: context.themeColors.onSurfaceMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyLarge),
        ),
      ],
    );
  }
}

class _SignInBody extends StatelessWidget {
  const _SignInBody({required this.onSignIn});
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.sports_volleyball_outlined,
              size: 56,
              color: AppColors.brand,
            ),
            const SizedBox(height: 16),
            Text(
              'Te chamaram para jogar! Entre no nexaGO para ver o convite e '
              'confirmar sua vaga.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: onSignIn,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(50),
              ),
              child: const Text('Entrar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBody extends StatelessWidget {
  const _MessageBody({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.link_off_rounded,
              size: 56,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.discover);
                }
              },
              child: const Text('Voltar'),
            ),
          ],
        ),
      ),
    );
  }
}
