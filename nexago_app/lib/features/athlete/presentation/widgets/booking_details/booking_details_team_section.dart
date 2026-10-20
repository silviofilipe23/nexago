import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/booking_invite_model.dart';
import '../../../domain/booking_invite_providers.dart';
import 'booking_details_section_card.dart';
import 'booking_details_team_providers.dart';
import 'booking_invite_sheet.dart';

class BookingDetailsTeamSection extends ConsumerStatefulWidget {
  const BookingDetailsTeamSection({
    super.key,
    required this.bookingId,
    required this.arenaName,
    required this.startAt,
    this.inviteEnabled = true,
    this.onLeft,
  });

  final String bookingId;
  final String arenaName;
  final DateTime startAt;

  /// Reserva ainda ativa (não passou nem foi cancelada).
  final bool inviteEnabled;

  /// Chamado depois que o convidado sai do jogo (a tela fecha).
  final VoidCallback? onLeft;

  @override
  ConsumerState<BookingDetailsTeamSection> createState() =>
      _BookingDetailsTeamSectionState();
}

class _BookingDetailsTeamSectionState
    extends ConsumerState<BookingDetailsTeamSection> {
  final Set<String> _busy = {};

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final teamAsync = ref.watch(bookingDetailsTeamProvider(widget.bookingId));

    return teamAsync.when(
      loading: () => const BookingDetailsSectionCard(
        title: 'Sua equipe',
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (_, __) => BookingDetailsSectionCard(
        title: 'Sua equipe',
        child: Text(
          'Não foi possível carregar a equipe.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ),
      data: (team) {
        final pending = team.viewerIsOwner
            ? (ref
                        .watch(
                          bookingInvitesForBookingProvider(widget.bookingId),
                        )
                        .valueOrNull ??
                    const <BookingInvite>[])
                .where(
                  (i) =>
                      i.isPending &&
                      !i.isShareLink &&
                      !team.participantUids.contains(i.inviteeUid),
                )
                .toList()
            : const <BookingInvite>[];
        final canInvite = team.viewerIsOwner &&
            widget.inviteEnabled &&
            team.openSlots > 0;

        return BookingDetailsSectionCard(
          title: team.viewerIsOwner ? 'Sua equipe' : 'Quem vai jogar',
          titleTrailing: Text(
            '${team.confirmedCount}/${team.totalSlots} confirmados',
            style: theme.textTheme.labelMedium?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _TeamProgressBar(
                confirmed: team.confirmedCount,
                total: team.totalSlots,
              ),
              const SizedBox(height: 14),
              for (var i = 0; i < team.members.length; i++) ...[
                if (i > 0) const SizedBox(height: 10),
                _TeamMemberRow(
                  member: team.members[i],
                  busy: _busy.contains(team.members[i].uid),
                  onRemove: _removable(team, team.members[i])
                      ? () => _remove(team.members[i])
                      : null,
                ),
              ],
              if (pending.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Aguardando resposta',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                for (final invite in pending) ...[
                  const SizedBox(height: 10),
                  _PendingInviteRow(
                    invite: invite,
                    busy: _busy.contains(invite.id),
                    onCancel: widget.inviteEnabled
                        ? () => _cancelInvite(invite)
                        : null,
                  ),
                ],
              ],
              const SizedBox(height: 14),
              if (team.viewerIsOwner)
                _PillButton(
                  icon: Icons.person_add_alt_1_outlined,
                  label: team.openSlots > 0
                      ? 'Convidar jogadores'
                      : 'Quadra completa',
                  color: AppColors.brand,
                  onPressed: canInvite ? () => _openInviteSheet(team) : null,
                )
              else if (team.viewerIsParticipant && widget.inviteEnabled)
                _PillButton(
                  icon: Icons.logout_rounded,
                  label: 'Sair do jogo',
                  color: AppColors.live,
                  loading: _busy.contains('leave'),
                  onPressed: _leave,
                ),
            ],
          ),
        );
      },
    );
  }

  /// Dono remove só quem entrou pelo convite novo (lista do servidor).
  bool _removable(BookingDetailsTeamState team, BookingDetailsTeamMember m) {
    final uid = m.uid;
    return team.viewerIsOwner &&
        widget.inviteEnabled &&
        !m.isOrganizer &&
        uid != null &&
        team.participantUids.contains(uid);
  }

  void _openInviteSheet(BookingDetailsTeamState team) {
    showBookingInviteSheet(
      context,
      bookingId: widget.bookingId,
      arenaName: widget.arenaName,
      startAt: widget.startAt,
      openSlots: team.openSlots,
      playingUids: {
        if (team.ownerUid != null) team.ownerUid!,
        ...team.participantUids,
      },
    );
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String action,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: Text(action),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _run(String key, Future<void> Function() action) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    try {
      await action();
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  Future<void> _remove(BookingDetailsTeamMember member) async {
    final uid = member.uid;
    if (uid == null) return;
    final ok = await _confirm(
      title: 'Tirar ${member.displayName} do jogo?',
      message: 'A vaga volta a ficar aberta e ${member.displayName} recebe '
          'um aviso.',
      action: 'Tirar do jogo',
    );
    if (!ok || !mounted) return;
    await _run(uid, () async {
      await ref
          .read(bookingInviteServiceProvider)
          .leave(widget.bookingId, participantUid: uid);
      if (mounted) showAppSnackBar(context, '${member.displayName} saiu do jogo.');
    });
  }

  Future<void> _cancelInvite(BookingInvite invite) async {
    await _run(invite.id, () async {
      await ref.read(bookingInviteServiceProvider).cancelInvite(invite.id);
      if (mounted) showAppSnackBar(context, 'Convite cancelado.');
    });
  }

  Future<void> _leave() async {
    final ok = await _confirm(
      title: 'Sair do jogo?',
      message: 'Sua vaga fica aberta para outra pessoa e quem reservou '
          'recebe um aviso.',
      action: 'Sair do jogo',
    );
    if (!ok || !mounted) return;
    await _run('leave', () async {
      await ref.read(bookingInviteServiceProvider).leave(widget.bookingId);
      if (!mounted) return;
      showAppSnackBar(context, 'Você saiu do jogo.');
      widget.onLeft?.call();
    });
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onPressed,
    this.loading = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: loading ? null : onPressed,
      icon: loading
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: context.themeColors.readableTone(color),
        disabledForegroundColor: color.withValues(alpha: 0.4),
        side: BorderSide(
          color: onPressed == null ? color.withValues(alpha: 0.4) : color,
          width: 1.5,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }
}

class _TeamProgressBar extends StatelessWidget {
  const _TeamProgressBar({required this.confirmed, required this.total});

  final int confirmed;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(total, (index) {
        final filled = index < confirmed;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: index < total - 1 ? 4 : 0),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: 4,
              decoration: BoxDecoration(
                color: filled
                    ? const Color(0xFF2E7D32)
                    : context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _PendingInviteRow extends StatelessWidget {
  const _PendingInviteRow({
    required this.invite,
    required this.busy,
    required this.onCancel,
  });

  final BookingInvite invite;
  final bool busy;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final name = invite.inviteeName?.trim().isNotEmpty == true
        ? invite.inviteeName!.trim()
        : 'Atleta convidado';
    final photo = invite.inviteeAvatarUrl;
    return Row(
      children: [
        Opacity(
          opacity: 0.6,
          child: CircleAvatar(
            radius: 22,
            backgroundColor: colors.surfaceRaised,
            backgroundImage: photo != null ? NetworkImage(photo) : null,
            child: photo == null
                ? Text(
                    initialsFromDisplayName(name),
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  )
                : null,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
              Text(
                'Convite enviado',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        if (busy)
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else if (onCancel != null)
          TextButton(
            onPressed: onCancel,
            child: const Text('Cancelar'),
          ),
      ],
    );
  }
}

class _TeamMemberRow extends StatelessWidget {
  const _TeamMemberRow({
    required this.member,
    this.busy = false,
    this.onRemove,
  });

  final BookingDetailsTeamMember member;
  final bool busy;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (member.isEmptySlot) {
      return Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                width: 1.5,
                strokeAlign: BorderSide.strokeAlignInside,
              ),
            ),
            child: Icon(
              Icons.add,
              size: 20,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member.displayName,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                Text(
                  member.subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: member.isOrganizer
                      ? AppColors.brand
                      : context.themeColors.surfaceRaised,
                  width: 2,
                ),
              ),
              child: CircleAvatar(
                radius: 20,
                backgroundColor: context.themeColors.surfaceRaised,
                backgroundImage: member.avatarUrl != null
                    ? NetworkImage(member.avatarUrl!)
                    : null,
                child: member.avatarUrl == null
                    ? Text(
                        member.initials,
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: member.isOrganizer
                              ? AppColors.brand
                              : context.themeColors.onSurface,
                        ),
                      )
                    : null,
              ),
            ),
            if (member.isConfirmed)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2E7D32),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: context.themeColors.surfaceCard,
                      width: 2,
                    ),
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    size: 11,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(
                TextSpan(
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                  children: [
                    TextSpan(text: member.displayName),
                    if (member.isOrganizer)
                      TextSpan(
                        text: ' · ${member.subtitle}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                  ],
                ),
              ),
              if (!member.isOrganizer)
                Text(
                  member.subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF2E7D32),
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
        ),
        if (member.showPaidBadge) _PaidBadge(),
        if (busy)
          const Padding(
            padding: EdgeInsets.only(left: 8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          )
        else if (onRemove != null)
          IconButton(
            tooltip: 'Tirar do jogo',
            onPressed: onRemove,
            icon: Icon(
              Icons.person_remove_outlined,
              size: 20,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
      ],
    );
  }
}

class _PaidBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF2E7D32).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'PAGO',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: const Color(0xFF2E7D32),
              fontWeight: FontWeight.w800,
              fontSize: 10,
              letterSpacing: 0.3,
            ),
      ),
    );
  }
}
