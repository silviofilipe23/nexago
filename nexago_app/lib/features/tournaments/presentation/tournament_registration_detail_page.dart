import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_card.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_substitution_logic.dart';
import 'widgets/tournament_registration/tournament_cancellation_request_sheet.dart';
import 'widgets/tournament_registration/tournament_substitution_sheet.dart';

/// Detalhe da inscrição confirmada — aberto pelo card correspondente da aba
/// "Minha inscrição". Reúne o que antes vivia espalhado no card (status,
/// histórico, ação de substituir) e ganha a ação de cancelar.
class TournamentRegistrationDetailPage extends ConsumerStatefulWidget {
  const TournamentRegistrationDetailPage({
    super.key,
    required this.tournamentId,
    required this.registrationId,
  });

  final String tournamentId;
  final String registrationId;

  @override
  ConsumerState<TournamentRegistrationDetailPage> createState() =>
      _TournamentRegistrationDetailPageState();
}

class _TournamentRegistrationDetailPageState
    extends ConsumerState<TournamentRegistrationDetailPage> {
  bool _busy = false;

  /// Equipe (trio+) só o capitão troca, nunca a própria vaga — mesma regra do
  /// gate (`tournament_substitution_logic.dart`). Aqui só decide a COPY
  /// ("dupla"/"equipe", "parceiro"/"atleta"); o servidor segue a autoridade.
  bool _isTeam(MyTournamentRegistration registration) =>
      (registration.teamSize ?? 2) >= 3;

  String _unitWord(MyTournamentRegistration registration) =>
      _isTeam(registration) ? 'equipe' : 'dupla';

  TournamentPartnerInvite? _pendingSubstitutionInvite(
    List<TournamentPartnerInvite> invites,
  ) {
    for (final invite in invites) {
      if (invite.isSubstitutionInvite &&
          invite.attachRegistrationId == widget.registrationId &&
          invite.isPending) {
        return invite;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final registrationsAsync = ref.watch(myTournamentRegistrationsProvider);
    final registrations = registrationsAsync.valueOrNull;

    MyTournamentRegistration? registration;
    if (registrations != null) {
      for (final r in registrations) {
        if (r.registrationId == widget.registrationId) {
          registration = r;
          break;
        }
      }
    }

    if (registration == null) {
      final loading = registrations == null && !registrationsAsync.hasError;
      return Scaffold(
        backgroundColor: colors.canvas,
        appBar: const NexaAppBar(title: Text('Minha inscrição')),
        body: loading
            ? const AppLoadingView()
            : AppEmptyView(
                icon: Icons.event_busy_outlined,
                title: 'Inscrição não encontrada',
                subtitle:
                    'Ela pode ter sido cancelada ou o link está desatualizado.',
                actionLabel: 'Voltar',
                onAction: () => context.canPop()
                    ? context.pop()
                    : context.goNamed(AppRouteNames.discover),
              ),
      );
    }

    final reg = registration;
    final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final profiles = ref
            .watch(registrationRosterProfilesProvider(reg.participantUids))
            .valueOrNull ??
        const <String, AppUserProfile>{};
    final replaceableUids = substitutionReplaceableUids(
      participantUids: reg.participantUids,
      uid: uid,
      teamSize: reg.teamSize,
      captainUid: reg.captainUid,
      partnerPending: reg.partnerPending,
      bracketPublished: reg.category?.bracketPublished ?? false,
    );
    final sentInvites =
        ref.watch(inviterTournamentPartnerInvitesProvider).valueOrNull ??
            const <TournamentPartnerInvite>[];
    final pendingInvite = _pendingSubstitutionInvite(sentInvites);

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Minha inscrição'),
            Text(
              '${reg.tournamentName} · ${reg.category?.name ?? 'Categoria'}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
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
          _StatusCard(registration: reg, profiles: profiles, myUid: uid),
          const SizedBox(height: AppSpacing.md),
          _InfoCard(registration: reg),
          const SizedBox(height: AppSpacing.xl),
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              'PRECISA MUDAR ALGUMA COISA?',
              style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
          if (pendingInvite != null)
            _ActionCard(
              highlighted: true,
              icon: Icons.swap_horiz_rounded,
              title: 'Substituição em curso',
              subtitle:
                  '${pendingInvite.inviteeName} ainda não respondeu — acompanhe',
              // A tela de acompanhamento nasce na Task 6 — até lá o card só
              // informa o estado, sem navegar (ver nota no relatório da Task 4).
              onTap: null,
            )
          else if (replaceableUids.isNotEmpty)
            _ActionCard(
              highlighted: true,
              icon: Icons.swap_horiz_rounded,
              title: 'Substituir um atleta da ${_unitWord(reg)}',
              subtitle: 'Alguém não vai poder jogar — mantenha a vaga '
                  'trocando o ${_isTeam(reg) ? 'atleta' : 'parceiro'}',
              // O wizard dedicado nasce na Task 5 — até lá reusa o sheet
              // existente (ver nota no relatório da Task 4).
              onTap: () => showTournamentSubstitutionSheet(
                context,
                registration: reg,
                replaceableUids: replaceableUids,
              ),
            ),
          if (pendingInvite != null || replaceableUids.isNotEmpty)
            const SizedBox(height: AppSpacing.sm),
          _ActionCard(
            highlighted: false,
            icon: Icons.cancel_outlined,
            title: 'Cancelar a inscrição da ${_unitWord(reg)}',
            subtitle: 'Sujeito à política de cancelamento do organizador',
            onTap: _busy ? null : () => _handleCancel(reg),
          ),
          if (reg.substitutionHistory.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                'HISTÓRICO',
                style:
                    AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
              ),
            ),
            NexaCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final entry in reg.substitutionHistory)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        '${entry.inName} entrou no lugar de ${entry.outName}.',
                        style: AppTypography.bodyS
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          _TournamentFooterCard(registration: reg),
        ],
      ),
    );
  }

  Future<void> _handleCancel(MyTournamentRegistration registration) async {
    if (_busy) return;
    final canCancelDirectly =
        !registration.isPaid && !registration.hasPartialPayment;

    if (canCancelDirectly) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Cancelar inscrição?'),
          content: Text(
            'Sua vaga no ${registration.tournamentName} '
            '(${registration.category?.name ?? 'categoria'}) será liberada e '
            'outro atleta poderá se inscrever.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Voltar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Cancelar inscrição'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;

      setState(() => _busy = true);
      try {
        await ref
            .read(tournamentPartnerInviteServiceProvider)
            .cancelRegistration(registration.registrationId);
        if (!mounted) return;
        ref.invalidate(myTournamentRegistrationsProvider);
        if (context.canPop()) context.pop();
        showAppSnackBar(context, 'Inscrição cancelada.');
      } on TournamentPartnerInviteException catch (e) {
        if (!mounted) return;
        showAppSnackBar(context, e.message, isError: true);
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }

    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => TournamentCancellationRequestSheet(
        tournamentName: registration.tournamentName,
      ),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .requestRegistrationCancellation(
            registrationId: registration.registrationId,
            reason: reason,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Pedido enviado. O organizador foi avisado.');
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.registration,
    required this.profiles,
    required this.myUid,
  });

  final MyTournamentRegistration registration;
  final Map<String, AppUserProfile> profiles;
  final String myUid;

  bool get _isTeam => (registration.teamSize ?? 2) >= 3;

  String get _badgeLabel {
    if (registration.isPaid) return 'INSCRIÇÃO CONFIRMADA';
    if (registration.isWaitlist) return 'LISTA DE ESPERA';
    return 'PAGAMENTO PENDENTE';
  }

  Color get _badgeColor {
    if (registration.isPaid) return AppColors.win;
    return AppColors.pending;
  }

  String get _statusLine {
    if (registration.isPaid) {
      final fee = registration.category?.entryFee;
      final base = fee != null ? '${formatBRL(fee)} pagos' : 'Pagamento em dia';
      final publishedSuffix =
          registration.category?.bracketPublished == true
              ? ' · chave publicada'
              : '';
      return '$base$publishedSuffix';
    }
    if (registration.isWaitlist) return 'na lista de espera';
    return 'pagamento pendente';
  }

  String get _title {
    if (_isTeam) return registration.teamName ?? 'Equipe';
    final otherUid = registration.participantUids
        .firstWhere((id) => id != myUid, orElse: () => '');
    if (otherUid.isEmpty) return 'Você';
    final profile = profiles[otherUid];
    final partnerName =
        profile != null ? appUserShortLabel(profile) : 'Parceiro';
    return 'Você & $partnerName';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      side: BorderSide(color: _badgeColor.withValues(alpha: 0.4)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: _badgeColor.withValues(alpha: 0.14),
              borderRadius: AppRadii.pillAll,
            ),
            child: Text(
              _badgeLabel,
              style: AppTypography.eyebrow.copyWith(color: _badgeColor),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _MemberAvatars(
                uids: registration.participantUids,
                profiles: profiles,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  _title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            _statusLine,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

class _MemberAvatars extends StatelessWidget {
  const _MemberAvatars({required this.uids, required this.profiles});

  final List<String> uids;
  final Map<String, AppUserProfile> profiles;

  static const _gradients = [
    [Color(0xFFFF6A1A), Color(0xFFC2185B)],
    [Color(0xFF2BD17E), Color(0xFF1E7A4D)],
    [Color(0xFF2B7CD1), Color(0xFF1E4A7A)],
    [Color(0xFF8A2BD1), Color(0xFF4A1E7A)],
    [Color(0xFFD1A62B), Color(0xFF7A5E1E)],
  ];

  @override
  Widget build(BuildContext context) {
    const size = 36.0;
    const overlap = size * 0.35;
    final shown = uids.take(5).toList();
    if (shown.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      width: size + (shown.length - 1) * (size - overlap),
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: i * (size - overlap),
              child: Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: _gradients[i % _gradients.length],
                  ),
                  shape: BoxShape.circle,
                  border:
                      Border.all(color: context.themeColors.canvas, width: 1.5),
                ),
                child: Center(
                  child: Text(
                    profiles[shown[i]] != null
                        ? appUserInitials(profiles[shown[i]]!)
                        : '?',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.white,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.registration});

  final MyTournamentRegistration registration;

  @override
  Widget build(BuildContext context) {
    final category = registration.category;
    final maxTeams = category?.maxTeams ?? 0;
    final unitLabel = category?.unitLabel ??
        ((registration.teamSize ?? 2) >= 3 ? 'equipes' : 'duplas');

    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _InfoRow(
            icon: Icons.calendar_month_outlined,
            text: registration.dateLabel,
          ),
          if ((registration.locationLine ?? '').isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _InfoRow(
              icon: Icons.place_outlined,
              text: registration.locationLine!,
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          _InfoRow(
            icon: Icons.emoji_events_outlined,
            text: maxTeams > 0
                ? '${category?.name ?? 'Categoria'} · $maxTeams $unitLabel'
                : category?.name ?? 'Categoria',
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: colors.onSurfaceMuted),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            text,
            style: AppTypography.bodyM.copyWith(color: colors.onSurface),
          ),
        ),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.highlighted,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool highlighted;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = highlighted ? AppColors.brand : colors.onSurfaceMuted;

    return NexaCard(
      onTap: onTap,
      side: highlighted
          ? BorderSide(color: AppColors.brand.withValues(alpha: 0.4))
          : null,
      color: highlighted
          ? AppColors.brand.withValues(alpha: 0.08)
          : colors.surfaceCard,
      child: Row(
        children: [
          Icon(icon, size: 22, color: accent),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style:
                      AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
          if (onTap != null)
            Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
        ],
      ),
    );
  }
}

class _TournamentFooterCard extends StatelessWidget {
  const _TournamentFooterCard({required this.registration});

  final MyTournamentRegistration registration;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final categoryName = registration.category?.name ?? 'Categoria';

    return NexaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            registration.tournamentName,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            '$categoryName · ${registration.dateLabel}',
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
          if ((registration.locationLine ?? '').isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              registration.locationLine!,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
    );
  }
}
