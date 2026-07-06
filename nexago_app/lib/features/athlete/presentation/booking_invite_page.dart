import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/booking_invite_model.dart';
import '../domain/booking_invite_providers.dart';

class BookingInvitePage extends ConsumerStatefulWidget {
  const BookingInvitePage({super.key, required this.inviteId});

  final String inviteId;

  @override
  ConsumerState<BookingInvitePage> createState() => _BookingInvitePageState();
}

class _BookingInvitePageState extends ConsumerState<BookingInvitePage> {
  bool _accepting = false;

  @override
  Widget build(BuildContext context) {
    final inviteAsync = ref.watch(bookingInviteProvider(widget.inviteId));

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: NexaAppBar(title: Text('Convite para jogar')),
      body: inviteAsync.when(
        loading: () => Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorBody(message: 'Não foi possível carregar o convite.'),
        data: (invite) {
          if (invite == null) {
            return _ErrorBody(message: 'Convite não encontrado ou expirado.');
          }
          if (invite.isExpired) {
            return _ErrorBody(message: 'Este convite expirou.');
          }
          return _InviteBody(
            invite: invite,
            accepting: _accepting,
            onAccept: () => _accept(invite),
          );
        },
      ),
    );
  }

  Future<void> _accept(BookingInvite invite) async {
    if (_accepting) return;
    setState(() => _accepting = true);

    try {
      final user = ref.read(authProvider).valueOrNull;
      final uid = user?.uid;
      if (uid == null || uid.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Faça login para aceitar o convite.')),
        );
        return;
      }

      final profile = ref.read(athleteProfileProvider).valueOrNull;
      final fromProfile = profile != null
          ? athleteDisplayName(profile, fallback: '')
          : '';
      final displayName = fromProfile.isNotEmpty
          ? fromProfile
          : (user?.displayName?.trim().isNotEmpty == true
              ? user!.displayName!.trim()
              : 'Atleta');

      final service = ref.read(bookingInviteServiceProvider);
      await service.acceptInvite(
        invite.id,
        acceptedByUid: uid,
        acceptedByName: displayName,
      );

      // XP de quem convidou é creditado server-side via Cloud Function (trigger
      // ao aceitar o convite em bookingInvites) — nenhuma chamada do client necessária.

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Convite aceito! Escolha um horário.')),
      );

      // Navega para a página de horários da arena com data/hora pré-selecionadas
      final query = StringBuffer('?date=${invite.date}&startTime=${invite.startTime}');
      if (invite.courtId != null && invite.courtId!.isNotEmpty) {
        query.write('&courtId=${invite.courtId}');
      }
      context.go('/arena/${invite.arenaId}/slots$query');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao aceitar convite: $e')),
      );
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }
}

class _InviteBody extends StatelessWidget {
  const _InviteBody({
    required this.invite,
    required this.accepting,
    required this.onAccept,
  });

  final BookingInvite invite;
  final bool accepting;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final dateLabel = _formatDate(invite.date);
    final hourLabel = '${invite.startTime} – ${invite.endTime}';

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
                '🏐 Você foi convidado!',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
              SizedBox(height: 6),
              Text(
                '${invite.invitedByName} quer jogar com você.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 20),
        // Detalhes da reserva
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                invite.arenaName,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 4),
              Text(
                invite.courtName,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              Divider(height: 24),
              _InfoRow(icon: Icons.calendar_today_outlined, label: dateLabel),
              SizedBox(height: 10),
              _InfoRow(icon: Icons.schedule_outlined, label: hourLabel),
            ],
          ),
        ),
        SizedBox(height: 28),
        FilledButton.icon(
          onPressed: accepting ? null : onAccept,
          icon: accepting
              ? SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(Icons.sports_volleyball_outlined),
          label: Text(accepting ? 'Confirmando...' : 'Quero jogar!'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => Navigator.of(context).maybePop(),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: Text('Agora não'),
        ),
      ],
    );
  }

  String _formatDate(String dateKey) {
    if (dateKey.length < 10) return dateKey;
    final parsed = DateTime.tryParse(dateKey);
    if (parsed == null) return dateKey;
    final formatted = DateFormat("EEEE, d 'de' MMMM 'de' yyyy", 'pt_BR').format(parsed);
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
        border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.12)),
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
        SizedBox(width: 8),
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodyLarge),
        ),
      ],
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.link_off_rounded, size: 56, color: Theme.of(context).colorScheme.error),
            SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            SizedBox(height: 24),
            OutlinedButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: Text('Voltar'),
            ),
          ],
        ),
      ),
    );
  }
}
