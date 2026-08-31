import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_avatar.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/profiles/users_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/partner_search_service.dart';
import '../data/recent_partners_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/substitution_journey_logic.dart';
import '../domain/tournament_discovery_models.dart';

/// Passo 2 do wizard de substituição: buscar/escolher quem ENTRA no lugar de
/// [replacedName] e enviar o convite. Chega por push interno do passo 1
/// (`tournament_substitution_wizard_page.dart`), nunca por rota própria —
/// volta natural é o `pop` do Navigator.
///
/// O substituto precisa ACEITAR para a troca acontecer.
class TournamentSubstitutionPickPage extends ConsumerStatefulWidget {
  const TournamentSubstitutionPickPage({
    super.key,
    required this.registration,
    required this.replacedUid,
    required this.replacedName,
    this.reason,
    this.reasonNote,
  });

  final MyTournamentRegistration registration;
  final String replacedUid;
  final String replacedName;
  final String? reason;
  final String? reasonNote;

  @override
  ConsumerState<TournamentSubstitutionPickPage> createState() =>
      _TournamentSubstitutionPickPageState();
}

class _TournamentSubstitutionPickPageState
    extends ConsumerState<TournamentSubstitutionPickPage> {
  final _searchController = TextEditingController();
  List<AppUserProfile> _results = const [];
  bool _searching = false;

  List<AppUserProfile> _recentPartners = const [];
  bool _loadingRecent = true;

  String? _inviterName;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadRecentPartners();
    _loadInviterProfile();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadRecentPartners() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    try {
      final partners =
          await ref.read(recentPartnersRepositoryProvider).loadRecentPartners(
                currentUserId: uid,
                categoryGenderType: widget.registration.category?.genderType,
              );
      if (!mounted) return;
      setState(() {
        _recentPartners = partners
            .where(
              (p) => !widget.registration.participantUids.contains(p.uid),
            )
            .toList();
      });
    } catch (_) {
      // Silêncio: a seção "Suas últimas duplas" só some — a busca continua
      // disponível como caminho principal.
    } finally {
      if (mounted) setState(() => _loadingRecent = false);
    }
  }

  Future<void> _loadInviterProfile() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty) return;
    try {
      final profile = await ref.read(usersRepositoryProvider).getUserById(uid);
      if (!mounted || profile == null) return;
      setState(() => _inviterName = appUserDisplayName(profile));
    } catch (_) {
      // Fica com o fallback "Atleta" no envio.
    }
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
            .where(
              (p) => !widget.registration.participantUids.contains(p.uid),
            )
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
    if (_sending) return;
    final substituteName = appUserDisplayName(substitute);
    final inviterName = (_inviterName?.trim().isNotEmpty ?? false)
        ? _inviterName!
        : 'Atleta';
    setState(() => _sending = true);
    try {
      final inviteId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .sendSubstitutionInvite(
            registrationId: widget.registration.registrationId,
            replacedUid: widget.replacedUid,
            replacedName: widget.replacedName,
            inviteeUid: substitute.uid,
            inviteeName: substituteName,
            inviterName: inviterName,
            reason: widget.reason,
            reasonNote: widget.reasonNote,
          );
      if (!mounted) return;
      if (kSubstitutionStatusRouteReady) {
        context.pushReplacementNamed(
          AppRouteNames.tournamentSubstitutionStatus,
          pathParameters: {
            'tournamentId': widget.registration.tournamentId,
            'inviteId': inviteId,
          },
        );
      } else {
        // A tela de acompanhamento nasce na Task 6 (`kSubstitutionStatusRouteReady`
        // ainda false) — até lá volta pro detalhe da inscrição (passo 2 + passo
        // 1) e avisa por snackbar. Captura o Navigator UMA vez: reusar a
        // mesma instância pros dois `pop()`s evita depender de `context`
        // (do State desta página) continuar resolvendo o ancestral certo
        // depois do 1º pop.
        final navigator = Navigator.of(context);
        navigator.pop();
        navigator.pop();
        showAppSnackBar(
          context,
          'Convite enviado. A troca acontece quando $substituteName aceitar.',
        );
      }
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
    final reg = widget.registration;
    final isTeam = (reg.teamSize ?? 2) >= 3;
    final unitWord = isTeam ? 'equipe' : 'dupla';
    final categoryName = reg.category?.name ?? 'Categoria';
    final reasonLabel =
        widget.reason != null ? substitutionReasonLabels[widget.reason] : null;
    final showPaymentNotice = reg.isPaid || reg.hasPartialPayment;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Quem entra no lugar'),
            Text(
              'Saindo: ${widget.replacedName}'
              '${reasonLabel != null ? ' · $reasonLabel' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.lg,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: [
          TextField(
            controller: _searchController,
            onSubmitted: _search,
            textInputAction: TextInputAction.search,
            cursorColor: AppColors.brand,
            style: AppTypography.bodyM.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              hintText: 'Buscar atleta por nome',
              hintStyle: AppTypography.bodyM.copyWith(
                color: colors.onSurfaceMuted.withValues(alpha: 0.6),
              ),
              prefixIcon: Icon(
                Icons.search_rounded,
                color: colors.onSurfaceMuted.withValues(alpha: 0.62),
              ),
              filled: true,
              fillColor: colors.surfaceRaised,
              contentPadding: const EdgeInsets.symmetric(vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide:
                    const BorderSide(color: AppColors.brand, width: 1.5),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (_searching)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_results.isNotEmpty) ...[
            for (final profile in _results)
              _CandidateRow(
                profile: profile,
                busy: _sending,
                onInvite: () => _send(profile),
              ),
          ],
          if (!_loadingRecent && _recentPartners.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            _RecentPartnersSection(
              categoryName: categoryName,
              partners: _recentPartners,
              busy: _sending,
              onInvite: _send,
            ),
          ],
          if (showPaymentNotice) ...[
            const SizedBox(height: AppSpacing.lg),
            _PaymentNotice(
              text: 'O substituto entra sem pagar de novo — a inscrição da '
                  '$unitWord já está quitada. O acerto com '
                  '${widget.replacedName} é entre vocês.',
            ),
          ],
        ],
      ),
    );
  }
}

class _RecentPartnersSection extends StatelessWidget {
  const _RecentPartnersSection({
    required this.categoryName,
    required this.partners,
    required this.busy,
    required this.onInvite,
  });

  final String categoryName;
  final List<AppUserProfile> partners;
  final bool busy;
  final ValueChanged<AppUserProfile> onInvite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.brand.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.history_rounded,
                size: 18,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Suas últimas duplas',
                    style: AppTypography.titleS.copyWith(
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Atletas com quem você já jogou e que cabem em '
                    '$categoryName.',
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        for (final profile in partners)
          _CandidateRow(
            profile: profile,
            subtitle: 'Jogou com você',
            busy: busy,
            onInvite: () => onInvite(profile),
          ),
      ],
    );
  }
}

class _CandidateRow extends StatelessWidget {
  const _CandidateRow({
    required this.profile,
    required this.busy,
    required this.onInvite,
    this.subtitle,
  });

  final AppUserProfile profile;
  final String? subtitle;
  final bool busy;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Material(
        color: colors.surfaceCard,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(
            color: colors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              AthleteProfileAvatar(
                size: 44,
                initials: appUserInitials(profile),
                imageUrl: profile.profilePhotoUrl,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      appUserDisplayName(profile),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          AppTypography.titleS.copyWith(color: colors.onSurface),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _InviteButton(busy: busy, onPressed: onInvite),
            ],
          ),
        ),
      ),
    );
  }
}

class _InviteButton extends StatelessWidget {
  const _InviteButton({required this.busy, required this.onPressed});

  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: OutlinedButton(
        onPressed: busy ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.brand,
          side: BorderSide(color: AppColors.brand.withValues(alpha: 0.55)),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          minimumSize: const Size(0, 36),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
        ),
        child: Text(
          'Convidar',
          style: AppTypography.soraRegular(
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _PaymentNotice extends StatelessWidget {
  const _PaymentNotice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.1),
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.pending.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.help_outline_rounded,
              size: 14,
              color: AppColors.pending,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}
