import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/auth/auth_providers.dart';
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
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/nexa_card.dart';
import '../../../core/ui/nexa_share.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../domain/substitution_journey_logic.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_invite_links.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_providers.dart';
import 'tournament_substitution_success_page.dart';

/// Acompanhamento da substituição (`AppRoutes.tournamentSubstitutionStatus`)
/// — para onde o passo 2 do wizard manda depois do envio e onde o card
/// "Substituição em curso" do detalhe da inscrição (Task 4) leva o atleta.
///
/// A vaga fica reservada até o convite ser respondido ou vencer (TTL); esta
/// tela é onde o convidante acompanha isso e pode lembrar/cancelar o
/// convite. Quando aceito, dá lugar à tela de sucesso (`pushReplacement`,
/// sem rota própria).
class TournamentSubstitutionStatusPage extends ConsumerStatefulWidget {
  const TournamentSubstitutionStatusPage({
    super.key,
    required this.tournamentId,
    required this.inviteId,
  });

  final String tournamentId;
  final String inviteId;

  @override
  ConsumerState<TournamentSubstitutionStatusPage> createState() =>
      _TournamentSubstitutionStatusPageState();
}

class _TournamentSubstitutionStatusPageState
    extends ConsumerState<TournamentSubstitutionStatusPage> {
  bool _navigatedToSuccess = false;
  bool _resending = false;
  bool _cancelling = false;

  MyTournamentRegistration? _registrationFor(
    TournamentPartnerInvite invite,
    List<MyTournamentRegistration> registrations,
  ) {
    for (final r in registrations) {
      if (r.registrationId == invite.attachRegistrationId) return r;
    }
    return null;
  }

  /// Convite aceito: troca a tela de acompanhamento pela de sucesso — chamado
  /// a cada `build` (mesmo padrão de `TournamentInviteAnnouncer._maybeAnnounce`:
  /// o 1º frame já pode chegar aceito, e o `ref.watch` cobre as mudanças
  /// seguintes). O guard evita agendar o `pushReplacement` mais de uma vez.
  void _maybeGoToSuccess(
    TournamentPartnerInvite invite,
    MyTournamentRegistration? registration,
  ) {
    if (_navigatedToSuccess) return;
    final outcome = substitutionOutcomeOf(
      invite.status,
      invite.expiresAt,
      DateTime.now(),
    );
    if (outcome != SubstitutionInviteOutcome.accepted) return;
    _navigatedToSuccess = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => TournamentSubstitutionSuccessPage(
            invite: invite,
            registration: registration,
          ),
        ),
      );
    });
  }

  Future<void> _resend(TournamentPartnerInvite invite) async {
    if (_resending) return;
    setState(() => _resending = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .resendSubstitutionInvite(invite.id);
      if (!mounted) return;
      showAppSnackBar(context, 'Lembrete enviado.');
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  void _shareWhatsapp(TournamentPartnerInvite invite, String tournamentName) {
    nexaShareText(
      context,
      substitutionInviteShareMessage(
        inviteeName: invite.inviteeName,
        tournamentName: tournamentName,
        inviteUrl: tournamentPartnerInviteUrl(invite.id),
      ),
    );
  }

  Future<void> _showReminderSheet(
    TournamentPartnerInvite invite,
    String tournamentName,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.notifications_active_outlined),
              title: const Text('Enviar lembrete por notificação'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _resend(invite);
              },
            ),
            ListTile(
              leading: const Icon(Icons.chat_outlined),
              title: const Text('Compartilhar no WhatsApp'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _shareWhatsapp(invite, tournamentName);
              },
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancel(
    TournamentPartnerInvite invite,
    String inName,
    String unitWord,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancelar a troca?'),
        content: Text(
          'O convite para $inName será cancelado e a $unitWord segue '
          'como está.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancelar troca'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    if (_cancelling) return;

    setState(() => _cancelling = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelInvite(invite.id);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final inviteAsync = ref.watch(
      tournamentPartnerInviteProvider(widget.inviteId),
    );
    final invite = inviteAsync.valueOrNull;
    final registrations =
        ref.watch(myTournamentRegistrationsProvider).valueOrNull ??
            const <MyTournamentRegistration>[];

    if (invite == null) {
      final loading = inviteAsync.isLoading && !inviteAsync.hasError;
      return Scaffold(
        backgroundColor: colors.canvas,
        appBar: const NexaAppBar(title: Text('Substituição em curso')),
        body: loading
            ? const AppLoadingView()
            : AppEmptyView(
                icon: Icons.event_busy_outlined,
                title: 'Convite não encontrado',
                subtitle:
                    'Ele pode ter sido cancelado ou o link está desatualizado.',
                actionLabel: 'Voltar',
                onAction: () => Navigator.of(context).maybePop(),
              ),
      );
    }

    final registration = _registrationFor(invite, registrations);
    _maybeGoToSuccess(invite, registration);

    final outcome = substitutionOutcomeOf(
      invite.status,
      invite.expiresAt,
      DateTime.now(),
    );
    final tournamentName = registration?.tournamentName ?? 'Torneio';
    final categoryName = registration?.category?.name ?? invite.categoryId;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Substituição em curso'),
            Text(
              '$tournamentName · $categoryName',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
      body: outcome == SubstitutionInviteOutcome.accepted
          // A navegação pra tela de sucesso já foi agendada acima.
          ? const AppLoadingView()
          : outcome != SubstitutionInviteOutcome.pending
              ? _TerminalBody(
                  outcome: outcome,
                  onTryAnother: () => context.pushReplacementNamed(
                    AppRouteNames.tournamentSubstitutionWizard,
                    pathParameters: {
                      'tournamentId': widget.tournamentId,
                      'registrationId': invite.attachRegistrationId ?? '',
                    },
                  ),
                  onBack: () => Navigator.of(context).maybePop(),
                )
              : _PendingBody(
                  invite: invite,
                  registration: registration,
                  resending: _resending,
                  cancelling: _cancelling,
                  onRemind: () => _showReminderSheet(invite, tournamentName),
                  onCancel: () => _confirmCancel(
                    invite,
                    invite.inviteeName,
                    _isTeamFor(invite, registration) ? 'equipe' : 'dupla',
                  ),
                ),
    );
  }
}

class _PendingBody extends ConsumerWidget {
  const _PendingBody({
    required this.invite,
    required this.registration,
    required this.resending,
    required this.cancelling,
    required this.onRemind,
    required this.onCancel,
  });

  final TournamentPartnerInvite invite;
  final MyTournamentRegistration? registration;
  final bool resending;
  final bool cancelling;
  final VoidCallback onRemind;
  final VoidCallback onCancel;

  bool get _isTeam => _isTeamFor(invite, registration);
  String get _unitWord => _isTeam ? 'equipe' : 'dupla';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = DateTime.now();
    final outName = invite.replacedName ?? 'Atleta';
    final inName = invite.inviteeName;
    final outFirst = _firstName(outName);
    final inFirst = _firstName(inName);

    final profileUids = <String>{
      ...?registration?.participantUids,
      if ((invite.replacedUid ?? '').isNotEmpty) invite.replacedUid!,
      if (invite.inviteeUid.isNotEmpty) invite.inviteeUid,
    }.toList()
      ..sort();
    final profilesAsync =
        ref.watch(registrationRosterProfilesProvider(profileUids));
    final profiles = profilesAsync.valueOrNull ?? const <String, AppUserProfile>{};
    final authUser = ref.watch(authProvider).valueOrNull;
    final outProfile = _profileForSubstitutionAthlete(
      profiles: profiles,
      uid: invite.replacedUid,
      name: outName,
    );
    final inProfile = _profileForSubstitutionAthlete(
      profiles: profiles,
      uid: invite.inviteeUid,
      name: inName,
    );
    final outUid = (invite.replacedUid ?? '').trim();
    final inUid = invite.inviteeUid.trim();

    final createdAtLabel = _formatTimelineTimestamp(invite.createdAt, now);
    final viewedLabel = substitutionViewedLabel(invite.viewedAt, now);
    final countdownLabel =
        substitutionCountdownLabel(invite.expiresAt, now) ?? '—';
    final progress = substitutionTtlProgress(
      invite.createdAt,
      invite.expiresAt,
      now,
    );
    final expiresLabel = _formatDateTime(invite.expiresAt);

    final showPaymentCard = registration != null &&
        (registration!.isPaid || registration!.hasPartialPayment);
    final entryFee = registration?.category?.entryFee;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        AppSpacing.xxl,
      ),
      children: [
        _SwapHeroCard(
          outName: outName,
          inName: inName,
          outFirst: outFirst,
          inFirst: inFirst,
          outInitials: outProfile != null
              ? appUserInitials(outProfile)
              : _initialsFor(outName),
          inInitials: inProfile != null
              ? appUserInitials(inProfile)
              : _initialsFor(inName),
          outImageUrl: _substitutionAthletePhotoUrl(
            profile: outProfile,
            uid: outUid,
            authUser: authUser,
          ),
          inImageUrl: _substitutionAthletePhotoUrl(
            profile: inProfile,
            uid: inUid,
            authUser: authUser,
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        Text(
          'O QUE FALTA',
          style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: AppSpacing.sm),
        NexaCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _TimelineRow(
                done: true,
                title: 'Pedido de substituição enviado',
                subtitle: createdAtLabel,
              ),
              const SizedBox(height: AppSpacing.md),
              _TimelineRow(
                done: false,
                title: '$inName precisa aceitar',
                subtitle: viewedLabel,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        _ReservedSlotBox(
          countdownLabel: countdownLabel,
          progress: progress,
          text: 'Enquanto isso $outName segue escalado. Se a troca não '
              'sair até $expiresLabel, a $_unitWord segue como está.',
        ),
        if (showPaymentCard) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            'ACERTO DO VALOR',
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: AppSpacing.sm),
          NexaCard(
            child: Text(
              'A inscrição de ${formatBRL(entryFee ?? 0)} continua paga — '
              'nada é cobrado de novo. Combine com $outName e $inName como '
              'fica o acerto.',
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: resending ? null : onRemind,
                child: Text('Lembrar $inFirst'),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: OutlinedButton(
                onPressed: cancelling ? null : onCancel,
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side:
                      BorderSide(color: AppColors.live.withValues(alpha: 0.4)),
                ),
                child: const Text('Cancelar troca'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _TerminalBody extends StatelessWidget {
  const _TerminalBody({
    required this.outcome,
    required this.onTryAnother,
    required this.onBack,
  });

  final SubstitutionInviteOutcome outcome;
  final VoidCallback onTryAnother;
  final VoidCallback onBack;

  String get _message => switch (outcome) {
        SubstitutionInviteOutcome.declined => 'O convite foi recusado.',
        SubstitutionInviteOutcome.expired => 'O convite expirou.',
        SubstitutionInviteOutcome.cancelled => 'A troca foi cancelada.',
        _ => 'Este convite não está mais válido.',
      };

  @override
  Widget build(BuildContext context) {
    return FeedbackPage.alert(
      title: _message,
      primaryAction: FeedbackAction(
        label: 'Tentar com outro atleta',
        onPressed: onTryAnother,
      ),
      secondaryAction: FeedbackAction(
        label: 'Voltar',
        isPrimary: false,
        onPressed: onBack,
      ),
    );
  }
}

class _SwapHeroCard extends StatelessWidget {
  const _SwapHeroCard({
    required this.outName,
    required this.inName,
    required this.outFirst,
    required this.inFirst,
    required this.outInitials,
    required this.inInitials,
    this.outImageUrl,
    this.inImageUrl,
  });

  final String outName;
  final String inName;
  final String outFirst;
  final String inFirst;
  final String outInitials;
  final String inInitials;
  final String? outImageUrl;
  final String? inImageUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _SwapAthleteAvatar(
                initials: outInitials,
                imageUrl: outImageUrl,
                role: _SwapAvatarRole.outgoing,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                ),
                child: Icon(
                  Icons.arrow_forward_rounded,
                  size: 22,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.7),
                ),
              ),
              _SwapAthleteAvatar(
                initials: inInitials,
                imageUrl: inImageUrl,
                role: _SwapAvatarRole.incoming,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '$outFirst sai, $inFirst entra',
            textAlign: TextAlign.center,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 4),
          Text(
            'Sua vaga está mantida. A troca fica valendo quando $inName '
            'aceitar.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ],
      ),
    );
  }
}

enum _SwapAvatarRole { outgoing, incoming }

class _SwapAthleteAvatar extends StatelessWidget {
  const _SwapAthleteAvatar({
    required this.initials,
    required this.role,
    this.imageUrl,
  });

  final String initials;
  final String? imageUrl;
  final _SwapAvatarRole role;

  static const _size = 56.0;
  static const _outFallback = [Color(0xFF2B3A4A), Color(0xFF1A2430)];
  static const _inFallback = [Color(0xFFB86A2B), Color(0xFF8A4A1E)];

  Color get _borderColor => switch (role) {
        _SwapAvatarRole.outgoing => AppColors.live.withValues(alpha: 0.85),
        _SwapAvatarRole.incoming => AppColors.pending,
      };

  List<Color> get _fallbackColors => switch (role) {
        _SwapAvatarRole.outgoing => _outFallback,
        _SwapAvatarRole.incoming => _inFallback,
      };

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    final badgeSize = _size * 0.34;

    return SizedBox(
      width: _size + 4,
      height: _size + 4,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: _size,
            height: _size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: _borderColor, width: 2),
            ),
            child: ClipOval(
              child: SizedBox(
                width: _size,
                height: _size,
                child: url != null && url.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: url,
                        width: _size,
                        height: _size,
                        fit: BoxFit.cover,
                        placeholder: (context, url) => _SwapInitialsFallback(
                          initials: initials,
                          size: _size,
                          colors: _fallbackColors,
                        ),
                        errorWidget: (context, url, error) =>
                            _SwapInitialsFallback(
                          initials: initials,
                          size: _size,
                          colors: _fallbackColors,
                        ),
                      )
                    : _SwapInitialsFallback(
                        initials: initials,
                        size: _size,
                        colors: _fallbackColors,
                      ),
              ),
            ),
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: role == _SwapAvatarRole.outgoing
                ? Container(
                    width: badgeSize,
                    height: badgeSize,
                    decoration: BoxDecoration(
                      color: AppColors.live,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.black, width: 2),
                    ),
                    child: Icon(
                      Icons.close_rounded,
                      size: badgeSize * 0.62,
                      color: AppColors.white,
                    ),
                  )
                : Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.pending,
                      borderRadius: AppRadii.pillAll,
                      border: Border.all(color: AppColors.black, width: 2),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: List.generate(
                        3,
                        (_) => Container(
                          width: 3,
                          height: 3,
                          margin: const EdgeInsets.symmetric(horizontal: 1),
                          decoration: const BoxDecoration(
                            color: AppColors.black,
                            shape: BoxShape.circle,
                          ),
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

class _SwapInitialsFallback extends StatelessWidget {
  const _SwapInitialsFallback({
    required this.initials,
    required this.size,
    required this.colors,
  });

  final String initials;
  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
        child: Center(
          child: Text(
            initials,
            style: AppTypography.soraRegular(
              fontSize: size * 0.32,
              fontWeight: FontWeight.w700,
              color: AppColors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.done,
    required this.title,
    this.subtitle,
  });

  final bool done;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          done
              ? Icons.check_circle_rounded
              : Icons.radio_button_unchecked_rounded,
          size: 20,
          color: done ? AppColors.win : colors.onSurfaceMuted,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.bodyM.copyWith(
                  color: colors.onSurface,
                  fontWeight: done ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ReservedSlotBox extends StatelessWidget {
  const _ReservedSlotBox({
    required this.countdownLabel,
    required this.progress,
    required this.text,
  });

  final String countdownLabel;
  final double progress;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.10),
        borderRadius: AppRadii.mdAll,
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.lock_clock_outlined,
                size: 16,
                color: AppColors.pending,
              ),
              const SizedBox(width: 6),
              Text(
                'VAGA RESERVADA',
                style: AppTypography.eyebrow.copyWith(color: AppColors.pending),
              ),
              const Spacer(),
              Text(
                countdownLabel,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.pending,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: AppRadii.pillAll,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: colors.surfaceRaised,
              color: AppColors.pending,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            text,
            style: AppTypography.bodyS.copyWith(color: colors.onSurface),
          ),
        ],
      ),
    );
  }
}

/// Equipe (trio+) — mesma regra de `teamSize` usada no resto da jornada
/// (`tournament_substitution_wizard_page.dart`). Sem inscrição carregada
/// ainda, cai no `isTeamInvite` que o backend já grava no convite.
bool _isTeamFor(
  TournamentPartnerInvite invite,
  MyTournamentRegistration? registration,
) =>
    (registration?.teamSize ?? (invite.isTeamInvite ? 3 : 2)) >= 3;

AppUserProfile? _profileForSubstitutionAthlete({
  required Map<String, AppUserProfile> profiles,
  required String? uid,
  required String name,
}) {
  final trimmedUid = uid?.trim() ?? '';
  if (trimmedUid.isNotEmpty) {
    final byUid = profiles[trimmedUid];
    if (byUid != null) return byUid;
  }

  final target = name.trim().toLowerCase();
  if (target.isEmpty) return null;
  for (final profile in profiles.values) {
    if (appUserDisplayName(profile).trim().toLowerCase() == target) {
      return profile;
    }
    final nickname = profile.nickname?.trim().toLowerCase();
    if (nickname != null && nickname.isNotEmpty && nickname == target) {
      return profile;
    }
  }
  return null;
}

String? _substitutionAthletePhotoUrl({
  required AppUserProfile? profile,
  required String uid,
  required User? authUser,
}) {
  final fromProfile = appUserProfilePhotoUrl(profile);
  if (fromProfile != null) return fromProfile;

  if (uid.isNotEmpty && authUser?.uid == uid) {
    final authPhoto = authUser?.photoURL?.trim();
    if (authPhoto != null && authPhoto.isNotEmpty) return authPhoto;
  }
  return null;
}

/// Primeiro nome não-vazio de [fullName]; "Atleta" se vier em branco.
String _firstName(String fullName) {
  final trimmed = fullName.trim();
  if (trimmed.isEmpty) return 'Atleta';
  return trimmed.split(RegExp(r'\s+')).first;
}

String _initialsFor(String fullName) {
  final parts =
      fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    final p = parts.first;
    return p.length >= 2 ? p.substring(0, 2).toUpperCase() : p.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

/// `"hoje · HH:mm"` / `"ontem · HH:mm"` / `"dd/MM · HH:mm"` — mesmo padrão de
/// `communityFeedRelativeTime` (dia por componentes locais, sem `DateFormat`
/// nem fuso: [at] já chega do Firestore convertido pro relógio do
/// dispositivo, e é isso mesmo que a copy "hoje"/"ontem" quer dizer).
String _formatTimelineTimestamp(DateTime at, DateTime now) {
  final time = '${at.hour.toString().padLeft(2, '0')}:'
      '${at.minute.toString().padLeft(2, '0')}';
  final sameDay =
      at.year == now.year && at.month == now.month && at.day == now.day;
  if (sameDay) return 'hoje · $time';

  final yesterday = now.subtract(const Duration(days: 1));
  final isYesterday = at.year == yesterday.year &&
      at.month == yesterday.month &&
      at.day == yesterday.day;
  if (isYesterday) return 'ontem · $time';

  final dd = at.day.toString().padLeft(2, '0');
  final mm = at.month.toString().padLeft(2, '0');
  return '$dd/$mm · $time';
}

String _formatDateTime(DateTime at) {
  final dd = at.day.toString().padLeft(2, '0');
  final mm = at.month.toString().padLeft(2, '0');
  final time = '${at.hour.toString().padLeft(2, '0')}:'
      '${at.minute.toString().padLeft(2, '0')}';
  return '$dd/$mm · $time';
}
