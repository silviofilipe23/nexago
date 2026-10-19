import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/profiles/users_repository.dart';
import '../../../../../core/search/search_keywords.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../../core/ui/nexa_share.dart';
import '../../../domain/booking_invite_links.dart';
import '../../../domain/booking_invite_providers.dart';

/// Folha "Convidar jogadores" do dono da reserva: link para o grupo (WhatsApp)
/// e busca de atleta do nexaGO com convite direto (push).
Future<void> showBookingInviteSheet(
  BuildContext context, {
  required String bookingId,
  required String arenaName,
  required DateTime startAt,
  required int openSlots,
  required Set<String> playingUids,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceRaised,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.9,
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => BookingInviteSheet(
      bookingId: bookingId,
      arenaName: arenaName,
      startAt: startAt,
      openSlots: openSlots,
      playingUids: playingUids,
    ),
  );
}

class BookingInviteSheet extends ConsumerStatefulWidget {
  const BookingInviteSheet({
    super.key,
    required this.bookingId,
    required this.arenaName,
    required this.startAt,
    required this.openSlots,
    required this.playingUids,
  });

  final String bookingId;
  final String arenaName;
  final DateTime startAt;
  final int openSlots;

  /// Dono + quem já entrou — aparecem como "No jogo" na busca.
  final Set<String> playingUids;

  @override
  ConsumerState<BookingInviteSheet> createState() => _BookingInviteSheetState();
}

class _BookingInviteSheetState extends ConsumerState<BookingInviteSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  String? _searchError;
  bool _sharingLink = false;
  final Set<String> _sending = {};
  final Set<String> _sentNow = {};

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    setState(() {});
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String term) async {
    if (!isSearchTermLongEnough(term)) {
      if (mounted) setState(() => _results = const []);
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final users = await ref
          .read(usersRepositoryProvider)
          .searchAthletesByKeywords(term, max: 15);
      if (!mounted || _controller.text != term) return;
      setState(() {
        _results = users;
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchError = 'Não foi possível buscar agora. Tente novamente.';
      });
    }
  }

  Future<void> _shareLink() async {
    if (_sharingLink) return;
    setState(() => _sharingLink = true);
    try {
      final inviteId = await ref
          .read(bookingInviteServiceProvider)
          .inviteLinkId(widget.bookingId);
      if (!mounted) return;
      await nexaShareText(
        context,
        bookingInviteShareMessage(
          arenaName: widget.arenaName,
          startAt: widget.startAt,
          inviteId: inviteId,
          openSlots: widget.openSlots,
        ),
      );
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _sharingLink = false);
    }
  }

  Future<void> _invite(AppUserProfile user) async {
    if (_sending.contains(user.uid)) return;
    setState(() => _sending.add(user.uid));
    try {
      await ref.read(bookingInviteServiceProvider).invitePlayers(
        bookingId: widget.bookingId,
        inviteeUids: [user.uid],
      );
      if (!mounted) return;
      setState(() => _sentNow.add(user.uid));
      showAppSnackBar(
        context,
        'Convite enviado para ${_nameOf(user)}.',
      );
    } catch (e) {
      if (mounted) showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _sending.remove(user.uid));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final pendingUids = {
      for (final invite in ref
              .watch(bookingInvitesForBookingProvider(widget.bookingId))
              .valueOrNull ??
          const [])
        if (invite.isPending && invite.inviteeUid != null) invite.inviteeUid!,
    };
    final term = _controller.text;
    // Quem convida não aparece na própria busca.
    final viewerUid = ref.watch(authProvider).valueOrNull?.uid;
    final results = _results.where((u) => u.uid != viewerUid).toList();
    final slotsLabel = switch (widget.openSlots) {
      1 => '1 vaga aberta',
      _ => '${widget.openSlots} vagas abertas',
    };

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Convidar jogadores',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$slotsLabel · quem aceitar primeiro entra no jogo.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 16),
                _ShareLinkCard(loading: _sharingLink, onTap: _shareLink),
                const SizedBox(height: 18),
                Text(
                  'Ou chame quem já está no nexaGO',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _controller,
                  onChanged: _onChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Buscar atleta por nome ou apelido',
                    prefixIcon: const Icon(Icons.search_rounded),
                    filled: true,
                    fillColor: colors.surfaceCard,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                if (_searching) ...[
                  const SizedBox(height: 6),
                  const LinearProgressIndicator(minHeight: 2),
                ],
              ],
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (_searchError != null)
                  _Hint(text: _searchError!, isError: true)
                else if (!isSearchTermLongEnough(term))
                  const _Hint(
                    text: 'Digite pelo menos 2 letras do nome ou do apelido.',
                  )
                else if (!_searching && results.isEmpty)
                  _Hint(text: 'Nenhum atleta encontrado com "$term".'),
                for (final user in results)
                  _AthleteRow(
                    name: _nameOf(user),
                    subtitle: _subtitleOf(user),
                    photoUrl: user.profilePhotoUrl,
                    state: widget.playingUids.contains(user.uid)
                        ? _RowState.playing
                        : (pendingUids.contains(user.uid) ||
                                _sentNow.contains(user.uid))
                            ? _RowState.invited
                            : _sending.contains(user.uid)
                                ? _RowState.sending
                                : _RowState.idle,
                    onInvite: () => _invite(user),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _nameOf(AppUserProfile user) {
  final nick = user.nickname?.trim() ?? '';
  if (nick.isNotEmpty) return nick;
  final full = user.fullName?.trim() ?? '';
  return full.isNotEmpty ? full : 'Atleta';
}

String _subtitleOf(AppUserProfile user) {
  final full = user.fullName?.trim() ?? '';
  final city = [user.city, user.state]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join('/');
  return [
    if (full.isNotEmpty && full != _nameOf(user)) full,
    if (city.isNotEmpty) city,
  ].join(' · ');
}

class _ShareLinkCard extends StatelessWidget {
  const _ShareLinkCard({required this.loading, required this.onTap});

  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Material(
      color: AppColors.brand.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                  color: AppColors.brand,
                  shape: BoxShape.circle,
                ),
                child: loading
                    ? const Padding(
                        padding: EdgeInsets.all(11),
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.black,
                        ),
                      )
                    : const Icon(Icons.link_rounded, color: AppColors.black),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Compartilhar link do jogo',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Mande no grupo do WhatsApp — quem tocar confirma a vaga.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.ios_share_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}

enum _RowState { idle, sending, invited, playing }

class _AthleteRow extends StatelessWidget {
  const _AthleteRow({
    required this.name,
    required this.subtitle,
    required this.photoUrl,
    required this.state,
    required this.onInvite,
  });

  final String name;
  final String subtitle;
  final String? photoUrl;
  final _RowState state;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final hasPhoto = photoUrl != null && photoUrl!.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: colors.surfaceCard,
            backgroundImage: hasPhoto ? NetworkImage(photoUrl!) : null,
            child: hasPhoto
                ? null
                : Text(
                    initialsFromDisplayName(name),
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
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
                if (subtitle.isNotEmpty)
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          switch (state) {
            _RowState.playing => _Tag(label: 'No jogo', color: colors.onSurfaceMuted),
            _RowState.invited => const _Tag(label: 'Convidado', color: Color(0xFF2E7D32)),
            _RowState.sending => const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            _RowState.idle => FilledButton(
                onPressed: onInvite,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  visualDensity: VisualDensity.compact,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                child: const Text(
                  'Convidar',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
          },
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
            ),
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text, this.isError = false});

  final String text;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: isError ? AppColors.live : context.themeColors.onSurfaceMuted,
              fontWeight: isError ? FontWeight.w600 : null,
            ),
      ),
    );
  }
}
