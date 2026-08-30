import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/profiles/app_user_profile.dart';
import '../../../../../core/profiles/users_repository.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../data/partner_search_service.dart';
import '../../../data/tournament_partner_invite_service.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Abre o fluxo "Substituir atleta": escolher a vaga → buscar o substituto →
/// enviar o convite. O substituto precisa ACEITAR para a troca acontecer.
Future<void> showTournamentSubstitutionSheet(
  BuildContext context, {
  required MyTournamentRegistration registration,
  required List<String> replaceableUids,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => TournamentSubstitutionSheet(
      registration: registration,
      replaceableUids: replaceableUids,
    ),
  );
}

class TournamentSubstitutionSheet extends ConsumerStatefulWidget {
  const TournamentSubstitutionSheet({
    super.key,
    required this.registration,
    required this.replaceableUids,
  });

  final MyTournamentRegistration registration;
  final List<String> replaceableUids;

  @override
  ConsumerState<TournamentSubstitutionSheet> createState() =>
      _TournamentSubstitutionSheetState();
}

class _TournamentSubstitutionSheetState
    extends ConsumerState<TournamentSubstitutionSheet> {
  Map<String, AppUserProfile> _members = const {};
  String? _replacedUid;
  final _searchController = TextEditingController();
  List<AppUserProfile> _results = const [];
  bool _searching = false;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    final members = await ref
        .read(usersRepositoryProvider)
        .getUsersByIds(widget.registration.participantUids);
    if (mounted) setState(() => _members = members);
  }

  String _nameOf(String uid) {
    final profile = _members[uid];
    if (profile == null) return 'Atleta';
    final name = appUserDisplayName(profile);
    return name.trim().isNotEmpty ? name : 'Atleta';
  }

  Future<void> _search(String query) async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    setState(() => _searching = true);
    try {
      final results =
          await ref.read(partnerSearchServiceProvider).searchPartners(
                currentUserId: uid,
                categoryGenderType: widget.registration.category?.genderType,
                query: query,
              );
      if (!mounted) return;
      setState(() {
        _results = results
            .where((p) => !widget.registration.participantUids.contains(p.uid))
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível buscar atletas. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _send(AppUserProfile substitute) async {
    final replacedUid = _replacedUid;
    if (replacedUid == null || _sending) return;
    final myProfile =
        _members[ref.read(authProvider).valueOrNull?.uid ?? ''];
    final myName = myProfile != null ? appUserDisplayName(myProfile) : '';
    final substituteName = appUserDisplayName(substitute);
    setState(() => _sending = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .sendSubstitutionInvite(
            registrationId: widget.registration.registrationId,
            replacedUid: replacedUid,
            replacedName: _nameOf(replacedUid),
            inviteeUid: substitute.uid,
            inviteeName: substituteName,
            inviterName: myName.trim().isNotEmpty ? myName : 'Atleta',
          );
      if (!mounted) return;
      Navigator.pop(context);
      showAppSnackBar(
        context,
        'Convite enviado. A troca acontece quando $substituteName aceitar.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Substituir atleta',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              'A vaga (e o pagamento dela) passa para o substituto quando ele '
              'aceitar o convite. Válido até a publicação das chaves.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: 16),
            Text('Quem sai?', style: theme.textTheme.titleSmall),
            RadioGroup<String>(
              groupValue: _replacedUid,
              onChanged: (v) => setState(() => _replacedUid = v),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final uid in widget.replaceableUids)
                    RadioListTile<String>(
                      value: uid,
                      title: Text(_nameOf(uid)),
                      contentPadding: EdgeInsets.zero,
                      activeColor: AppColors.brand,
                    ),
                ],
              ),
            ),
            if (_replacedUid != null) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _searchController,
                onSubmitted: _search,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Buscar substituto por nome',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
              const SizedBox(height: 8),
              if (_searching)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else
                ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 280),
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _results.length,
                    itemBuilder: (context, index) {
                      final profile = _results[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(appUserDisplayName(profile)),
                        trailing: TextButton(
                          onPressed: _sending ? null : () => _send(profile),
                          child: const Text('Convidar'),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
