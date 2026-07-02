import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../tournaments/data/users_repository.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../../domain/tournament_staff/tournament_staff_providers.dart';
import 'widgets/organizer_tournament_subpage_scaffold.dart';

/// Equipe do torneio — somente o dono acessa (card oculto para staff e as
/// rules rejeitam escrita de não-donos).
class OrganizerTournamentStaffPage extends ConsumerWidget {
  const OrganizerTournamentStaffPage({super.key, required this.tournamentId});

  final String tournamentId;

  Future<void> _addMember(BuildContext context, WidgetRef ref) async {
    final staff = ref.read(tournamentStaffProvider(tournamentId)).valueOrNull ??
        const <TournamentStaffMember>[];
    final currentUid = FirebaseAuth.instance.currentUser?.uid;
    final excludedUids = <String>{
      for (final member in staff) member.uid,
      if (currentUid != null) currentUid,
    };

    final user = await showModalBottomSheet<AppUserProfile>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _StaffUserSearchSheet(excludedUids: excludedUids),
    );
    if (user == null || !context.mounted) return;

    final role = await _pickRole(context, title: user.nickname ?? user.fullName);
    if (role == null || !context.mounted) return;

    try {
      await ref
          .read(tournamentStaffRepositoryProvider)
          .addStaff(tournamentId: tournamentId, user: user, role: role);
      if (context.mounted) {
        showAppSnackBar(context, 'Adicionado à equipe como ${role.label.toLowerCase()}');
      }
    } catch (e) {
      if (context.mounted) showAppErrorSnackBar(context, e);
    }
  }

  Future<TournamentStaffRole?> _pickRole(
    BuildContext context, {
    String? title,
  }) {
    return showModalBottomSheet<TournamentStaffRole>(
      context: context,
      backgroundColor: context.themeColors.surfaceRaised,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Text(
                title == null || title.trim().isEmpty
                    ? 'Qual o papel na equipe?'
                    : 'Qual o papel de ${title.trim()}?',
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: sheetContext.themeColors.onSurface,
                ),
              ),
            ),
            for (final role in TournamentStaffRole.values)
              ListTile(
                leading: Icon(
                  role == TournamentStaffRole.manager
                      ? Icons.manage_accounts_rounded
                      : Icons.scoreboard_rounded,
                  color: AppColors.brand,
                ),
                title: Text(role.label),
                subtitle: Text(role.description),
                onTap: () => Navigator.of(sheetContext).pop(role),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _changeRole(
    BuildContext context,
    WidgetRef ref,
    TournamentStaffMember member,
  ) async {
    final role = await _pickRole(context, title: member.displayLabel);
    if (role == null || role == member.role || !context.mounted) return;
    try {
      await ref.read(tournamentStaffRepositoryProvider).updateStaffRole(
            tournamentId: tournamentId,
            staffUid: member.uid,
            role: role,
          );
    } catch (e) {
      if (context.mounted) showAppErrorSnackBar(context, e);
    }
  }

  Future<void> _removeMember(
    BuildContext context,
    WidgetRef ref,
    TournamentStaffMember member,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remover da equipe?'),
        content: Text(
          '${member.displayLabel} perderá o acesso à operação deste torneio.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(tournamentStaffRepositoryProvider).removeStaff(
            tournamentId: tournamentId,
            staffUid: member.uid,
          );
      if (context.mounted) showAppSnackBar(context, 'Removido da equipe');
    } catch (e) {
      if (context.mounted) showAppErrorSnackBar(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffAsync = ref.watch(tournamentStaffProvider(tournamentId));

    return OrganizerTournamentSubpageScaffold(
      title: 'Equipe',
      trailing: Material(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => _addMember(context, ref),
          borderRadius: BorderRadius.circular(12),
          child: const SizedBox(
            width: 44,
            height: 44,
            child: Icon(Icons.person_add_alt_1_rounded,
                size: 22, color: AppColors.black),
          ),
        ),
      ),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          sliver: staffAsync.when(
            loading: () => const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => SliverToBoxAdapter(child: Text('Erro: $e')),
            data: (members) {
              if (members.isEmpty) {
                return SliverFillRemaining(
                  hasScrollBody: false,
                  child: _StaffEmptyState(
                    onAdd: () => _addMember(context, ref),
                  ),
                );
              }
              return SliverList.separated(
                itemCount: members.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, index) => _StaffMemberTile(
                  member: members[index],
                  onChangeRole: () =>
                      _changeRole(context, ref, members[index]),
                  onRemove: () => _removeMember(context, ref, members[index]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _StaffEmptyState extends StatelessWidget {
  const _StaffEmptyState({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          Icons.groups_2_rounded,
          size: 48,
          color: context.themeColors.onSurfaceMuted,
        ),
        const SizedBox(height: 12),
        Text(
          'Nenhum membro na equipe',
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurface,
          ),
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(
            'Adicione gestores para ajudar na operação ou mesários para lançar placar.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
          label: const Text('Adicionar membro'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
          ),
        ),
      ],
    );
  }
}

class _StaffMemberTile extends StatelessWidget {
  const _StaffMemberTile({
    required this.member,
    required this.onChangeRole,
    required this.onRemove,
  });

  final TournamentStaffMember member;
  final VoidCallback onChangeRole;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final photo = member.photoUrl;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.brand.withValues(alpha: 0.15),
            backgroundImage: photo != null && photo.isNotEmpty
                ? NetworkImage(photo)
                : null,
            child: photo == null || photo.isEmpty
                ? Text(
                    member.displayLabel.substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
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
                  member.displayLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  member.role.label,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            icon: Icon(
              Icons.more_vert_rounded,
              color: context.themeColors.onSurfaceMuted,
            ),
            onSelected: (value) {
              if (value == 'role') onChangeRole();
              if (value == 'remove') onRemove();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'role', child: Text('Alterar papel')),
              const PopupMenuItem(
                value: 'remove',
                child: Text('Remover da equipe'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StaffUserSearchSheet extends ConsumerStatefulWidget {
  const _StaffUserSearchSheet({required this.excludedUids});

  final Set<String> excludedUids;

  @override
  ConsumerState<_StaffUserSearchSheet> createState() =>
      _StaffUserSearchSheetState();
}

class _StaffUserSearchSheetState extends ConsumerState<_StaffUserSearchSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<AppUserProfile> _results = const [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String term) async {
    final query = term.trim();
    if (query.length < 2) {
      if (mounted) setState(() => _results = const []);
      return;
    }
    setState(() => _loading = true);
    try {
      final users = await ref
          .read(usersRepositoryProvider)
          .searchUsersByNicknameOrName(query, max: 20);
      if (!mounted) return;
      setState(() {
        _results = users
            .where((u) => !widget.excludedUids.contains(u.uid))
            .toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (sheetContext, scrollController) => Container(
        decoration: BoxDecoration(
          color: context.themeColors.canvas,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Adicionar à equipe',
                    style: AppTypography.soraRegular(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _controller,
                    autofocus: true,
                    onChanged: _onQueryChanged,
                    decoration: InputDecoration(
                      hintText: 'Buscar por nome ou apelido',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: context.themeColors.surfaceRaised,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty
                  ? Center(
                      child: Text(
                        _controller.text.trim().length < 2
                            ? 'Digite ao menos 2 letras para buscar'
                            : (_loading ? '' : 'Nenhum usuário encontrado'),
                        style: TextStyle(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: scrollController,
                      itemCount: _results.length,
                      itemBuilder: (_, index) {
                        final user = _results[index];
                        final photo = user.profilePhotoUrl;
                        final name = (user.nickname?.trim().isNotEmpty ?? false)
                            ? user.nickname!.trim()
                            : (user.fullName ?? 'Usuário');
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor:
                                AppColors.brand.withValues(alpha: 0.15),
                            backgroundImage: photo != null && photo.isNotEmpty
                                ? NetworkImage(photo)
                                : null,
                            child: photo == null || photo.isEmpty
                                ? Text(
                                    name.substring(0, 1).toUpperCase(),
                                    style: const TextStyle(
                                      color: AppColors.brand,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  )
                                : null,
                          ),
                          title: Text(name),
                          subtitle: user.fullName != null &&
                                  user.fullName!.trim().isNotEmpty &&
                                  user.fullName != name
                              ? Text(user.fullName!)
                              : null,
                          onTap: () => Navigator.of(context).pop(user),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
