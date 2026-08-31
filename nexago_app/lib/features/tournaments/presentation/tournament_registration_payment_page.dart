import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../data/tournament_partner_invite_service.dart';
import '../data/tournament_registration_service.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_invite_announcer.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_registration_pix_args.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_registration_success_args.dart';
import '../domain/tournament_team_roster_logic.dart';
import 'widgets/tournament_registration/tournament_cancellation_request_sheet.dart';
import 'widgets/tournament_registration/tournament_registration_cancellation_section.dart';
import 'widgets/tournament_registration/tournament_registration_header.dart';
import 'widgets/tournament_registration/tournament_registration_payment_step.dart';
import 'widgets/tournament_registration/tournament_registration_roster_card.dart';
import 'widgets/tournament_registration/tournament_registration_sticky_bar.dart';

/// Pagamento da inscrição — **tela própria**, como no portal do atleta
/// (`/torneios/:id/inscricao/pagamento`).
///
/// Saiu de dentro do wizard junto com a virada para a tela única: os cartões de
/// categoria/uniforme/inscrição ficaram numa tela só e o pagamento, que é outro
/// momento (e tem PIX, declaração ao organizador e cancelamento), ganhou rota
/// própria. Quem chega aqui já tem inscrição criada — sem `registrationId` a
/// tela não tem o que pagar e devolve o atleta para a inscrição.
class TournamentRegistrationPaymentPage extends ConsumerStatefulWidget {
  const TournamentRegistrationPaymentPage({
    super.key,
    required this.tournamentId,
    required this.registrationId,
    this.categoryId,
  });

  final String tournamentId;
  final String registrationId;
  final String? categoryId;

  @override
  ConsumerState<TournamentRegistrationPaymentPage> createState() =>
      _TournamentRegistrationPaymentPageState();
}

class _TournamentRegistrationPaymentPageState
    extends ConsumerState<TournamentRegistrationPaymentPage> {
  String _paymentType = 'share';
  bool _submitting = false;
  bool _contactingOrganizer = false;
  bool _leavingTeam = false;
  bool _paidPopHandled = false;

  bool get _canPayFull => true;

  TournamentCategoryOffer? _resolveCategory(
    TournamentDetail tournament,
    TournamentRegistrationSnapshot? snap,
  ) {
    final wanted = widget.categoryId?.trim() ?? '';
    final categories = tournament.categoryOffers;
    if (categories.isEmpty) return null;
    if (wanted.isNotEmpty) {
      for (final c in categories) {
        if (c.id == wanted) return c;
      }
    }
    // Sem categoria na rota (deep link antigo): o elenco da inscrição não diz
    // qual é, então cai na primeira — o valor exibido pode divergir, e é por
    // isso que quem navega daqui sempre manda o `categoryId`.
    return categories.first;
  }

  void _showProfileAccessBlocked() {
    final access = ref.read(tournamentAccessStateProvider);
    final message = access.snackbarMessage;
    if (message != null && mounted) {
      showAppSnackBar(context, message, isError: true);
    }
  }

  void _navigateToRegistrationSuccess({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
  }) {
    if (!mounted) return;
    context.pushReplacementNamed(
      AppRouteNames.tournamentRegistrationSuccess,
      pathParameters: <String, String>{'tournamentId': widget.tournamentId},
      queryParameters: <String, String>{
        'registrationId': widget.registrationId,
        'tournamentName': tournament.name,
        'categoryName': category.name,
      },
      extra: TournamentRegistrationSuccessArgs(
        tournamentId: widget.tournamentId,
        registrationId: widget.registrationId,
        tournamentName: tournament.name,
        categoryName: category.name,
      ),
    );
  }

  List<TournamentRosterMember> _teamRoster(
    TournamentRegistrationSnapshot snap,
  ) {
    final profiles =
        ref
            .watch(registrationRosterProfilesProvider(snap.participantUids))
            .valueOrNull ??
        const <String, AppUserProfile>{};
    return buildTeamRoster(
      participantUids: snap.participantUids,
      captainUid: snap.captainUid,
      myUid: ref.watch(authServiceProvider).currentUser?.uid,
      nameByUid: {
        for (final entry in profiles.entries)
          entry.key: appUserDisplayName(entry.value),
      },
      photoByUid: {
        for (final entry in profiles.entries)
          if (entry.value.profilePhotoUrl?.isNotEmpty ?? false)
            entry.key: entry.value.profilePhotoUrl!,
      },
    );
  }

  Future<bool> _confirmDirectPaymentDeclaration(
    TournamentRegistrationQuote quote,
  ) async {
    final payFull = _canPayFull && _paymentType == 'full';
    final amount = payFull ? quote.displayTotal : quote.shareAmount;
    final confirmed = await showAdaptiveDialog<bool>(
      context: context,
      builder: (context) => AlertDialog.adaptive(
        title: const Text('Confirmar pagamento?'),
        content: Text(
          'Você está informando que já pagou '
          '${formatRegistrationMoney(amount)} direto ao organizador. Ele será '
          'avisado e vai conferir o recebimento — não dá para desfazer por '
          'aqui.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Ainda não paguei'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Já paguei'),
          ),
        ],
      ),
    );
    return confirmed == true && mounted;
  }

  Future<void> _submitPayment({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
    required TournamentRegistrationQuote quote,
  }) async {
    if (_submitting) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }

    setState(() => _submitting = true);
    try {
      if (!registrationRequiresPayment(quote)) {
        final result = await ref
            .read(paymentServiceProvider)
            .confirmFreeTournamentRegistration(
              registrationId: widget.registrationId,
            );
        if (!mounted) return;
        if (result.isPaid) {
          _navigateToRegistrationSuccess(
            tournament: tournament,
            category: category,
          );
          return;
        }
        showAppSnackBar(
          context,
          'Inscrição confirmada. Aguarde seu parceiro confirmar a dele.',
        );
        return;
      }

      if (tournamentUsesDirectOrganizerPayment(tournament)) {
        // Declarar não tem desfazer no app e aciona o organizador: o clique
        // acidental é caro, então vale perguntar antes.
        if (!await _confirmDirectPaymentDeclaration(quote)) return;
        final result = await ref
            .read(paymentServiceProvider)
            .reserveDirectOrganizerRegistration(
              registrationId: widget.registrationId,
            );
        if (!mounted) return;
        // Fica na tela: o estado pós-declaração (aguardando parceiro /
        // aguardando o organizador conferir) é o que o atleta precisa ver.
        showAppSnackBar(
          context,
          result.bothAthletesReserved
              ? 'Pagamento informado! A vaga está garantida — o organizador vai '
                    'conferir o recebimento.'
              : 'Sua parte foi informada. A inscrição fecha quando seu parceiro '
                    'informar a dele.',
        );
        return;
      }

      final amountType = (_canPayFull && _paymentType == 'full')
          ? 'full'
          : 'share';
      final amountReais = amountType == 'full'
          ? quote.displayTotal
          : quote.shareAmount;
      if (!mounted) return;
      await context.pushNamed(
        AppRouteNames.tournamentRegistrationPix,
        pathParameters: <String, String>{'tournamentId': widget.tournamentId},
        queryParameters: <String, String>{
          'registrationId': widget.registrationId,
          'categoryId': category.id,
          'tournamentName': tournament.name,
          'categoryName': category.name,
          'shareAmountReais': amountReais.toString(),
          'amountType': amountType,
        },
        extra: TournamentRegistrationPixArgs(
          registrationId: widget.registrationId,
          tournamentId: widget.tournamentId,
          tournamentName: tournament.name,
          categoryName: category.name,
          shareAmountReais: amountReais,
          amountType: amountType,
        ),
      );
    } on PaymentException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _leaveTeam(TournamentRegistrationSnapshot snap) async {
    if (_leavingTeam) return;
    final teamName = snap.teamName?.trim();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sair da equipe?'),
        content: Text(
          'Sua vaga em ${teamName?.isNotEmpty == true ? teamName : 'a equipe'} '
          'será liberada para outro atleta, e o capitão será avisado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sair da equipe'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _leavingTeam = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .leaveTeamRegistration(snap.registrationId);
      if (!mounted) return;
      if (context.canPop()) {
        context.pop();
      } else {
        context.goNamed(AppRouteNames.myTournaments);
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) showAppSnackBar(context, 'Você saiu da equipe.');
      });
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _leavingTeam = false);
    }
  }

  Future<void> _confirmCancelRegistration() async {
    if (_submitting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancelar reserva?'),
        content: const Text(
          'Sua vaga será liberada e outro atleta poderá se inscrever nesta '
          'categoria.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancelar reserva'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelRegistration(widget.registrationId);
      if (!mounted) return;
      if (context.canPop()) {
        context.pop();
      } else {
        context.goNamed(AppRouteNames.myTournaments);
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) showAppSnackBar(context, 'Reserva cancelada.');
      });
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _openCancellationRequestSheet(
    TournamentDetail tournament,
  ) async {
    if (_submitting) return;
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => TournamentCancellationRequestSheet(
        tournamentName: tournament.name,
      ),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .requestRegistrationCancellation(
            registrationId: widget.registrationId,
            reason: reason,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Pedido enviado. O organizador foi avisado.');
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _openOrganizerWhatsApp(TournamentDetail tournament) async {
    if (_contactingOrganizer) return;
    setState(() => _contactingOrganizer = true);
    try {
      final contact = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .organizerContact(tournament.id);
      if (!mounted) return;
      if (!contact.hasWhatsApp) {
        showAppSnackBar(
          context,
          contact.email.isNotEmpty
              ? 'Organizador sem WhatsApp. Fale por e-mail: ${contact.email}'
              : 'Organizador sem WhatsApp cadastrado.',
          isError: true,
        );
        return;
      }
      final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
        phone: contact.whatsappPhone,
        message:
            'Olá! Sou atleta inscrito no ${tournament.name} e pedi o '
            'cancelamento da minha inscrição.',
      );
      final uri = url != null ? Uri.tryParse(url) : null;
      if (uri == null) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o WhatsApp.',
          isError: true,
        );
        return;
      }
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!launched) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o WhatsApp.',
          isError: true,
        );
      }
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _contactingOrganizer = false);
    }
  }

  /// Volta para a inscrição, onde o convite ao parceiro é enviado.
  void _openPartnerInvite() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: <String, String>{'tournamentId': widget.tournamentId},
      queryParameters: <String, String>{
        if (widget.categoryId != null) 'categoryId': widget.categoryId!,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: NexaAsyncView<TournamentDetail?>(
          value: tournamentAsync,
          onRetry: () =>
              ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
          errorTitle: 'Não foi possível carregar',
          errorMessage: 'Não foi possível carregar o torneio.',
          emptyWhen: (value) => value == null,
          empty: AppEmptyView(
            icon: Icons.emoji_events_outlined,
            title: 'Torneio não encontrado',
            subtitle:
                'O torneio pode ter sido removido ou o link está desatualizado.',
            actionLabel: 'Voltar',
            onAction: () => context.canPop()
                ? context.pop()
                : context.goNamed(AppRouteNames.myTournaments),
          ),
          data: (value) {
            final tournament = value!;
            final snap = ref
                .watch(
                  tournamentRegistrationSnapshotProvider(widget.registrationId),
                )
                .valueOrNull;
            final category = _resolveCategory(tournament, snap);
            if (category == null) {
              return AppEmptyView(
                icon: Icons.category_outlined,
                title: 'Categoria não encontrada',
                subtitle: 'Volte e escolha a categoria da sua inscrição.',
                actionLabel: 'Voltar',
                onAction: () => context.pop(),
              );
            }

            final quote = buildRegistrationQuote(
              entryFee: category.entryFee,
              teamSize: category.rosterSize,
            );
            final currentUid = ref
                .watch(authServiceProvider)
                .currentUser
                ?.uid;
            final isFullyPaid = snap?.isPaid == true;
            final athleteSharePaid =
                currentUid != null &&
                (snap?.athleteSharePaid(currentUid) ?? false);

            // Confirmada e paga: a tela de sucesso é o destino, e só uma vez.
            if (isFullyPaid && !_paidPopHandled) {
              _paidPopHandled = true;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                _navigateToRegistrationSuccess(
                  tournament: tournament,
                  category: category,
                );
              });
            }

            final isDirectOrganizer =
                tournamentUsesDirectOrganizerPayment(tournament) &&
                registrationRequiresPayment(quote);
            final directState = snap == null
                ? DirectPaymentState.idle
                : resolveDirectPaymentState(
                    isPaid: snap.isPaid,
                    sharePaidUids: snap.sharePaidUids,
                    myUid: currentUid,
                    declaredPaidAt: snap.declaredPaidAt,
                    paymentVerifiedByOrganizer: snap.paymentVerifiedByOrganizer,
                  );
            final progressLabel = registrationDualPaymentProgressLabel(
              quote: quote,
              paidAmount: snap?.paidAmount ?? 0,
              isPaid: isFullyPaid,
              sharePaidUids: snap?.sharePaidUids ?? const <String>[],
              currentAthleteUid: currentUid,
              isDirectOrganizerPayment: isDirectOrganizer,
              directPaymentState: isDirectOrganizer ? directState : null,
            );

            final awaitingSoloPartner = registrationAwaitingSoloPartner(
              snap: snap,
              isFullyPaid: isFullyPaid,
            );
            final paidAwaitingPartner = registrationPaidAwaitingPartner(
              snap: snap,
            );
            final awaitingPartner = awaitingSoloPartner || paidAwaitingPartner;
            final effectiveProgressLabel = paidAwaitingPartner
                ? 'Vaga garantida! Você pagou o total — convide seu parceiro, '
                      'ele entra sem taxa.'
                : progressLabel;

            final isFree = !registrationRequiresPayment(quote);
            final ctaEnabled = !isFullyPaid && !athleteSharePaid;

            return Column(
              children: [
                TournamentRegistrationHeader(
                  onBack: () => context.canPop()
                      ? context.pop()
                      : context.goNamed(AppRouteNames.myTournaments),
                  title: 'Pagamento',
                  tournamentName: tournament.name,
                  tournamentDateLabel: tournament.dateLabel,
                  categoryLabel: category.name,
                  showTournamentInfo: true,
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenH,
                      AppSpacing.lg,
                      AppSpacing.screenH,
                      AppSpacing.xxl,
                    ),
                    children: [
                      TournamentRegistrationPaymentStep(
                        category: category,
                        quote: quote,
                        paymentType: _canPayFull ? _paymentType : 'share',
                        onPaymentTypeChanged: (value) =>
                            setState(() => _paymentType = value),
                        dualPaymentOnly: !_canPayFull,
                        progressLabel: effectiveProgressLabel,
                        isFullyPaid: isFullyPaid,
                        isFreeRegistration: isFree,
                        // Já pago e sem parceiro: esconde "pague ao
                        // organizador" e mostra só o convite (entra sem taxa).
                        isDirectOrganizerPayment:
                            isDirectOrganizer && !paidAwaitingPartner,
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        tournamentCity: tournament.city,
                        organizerManagerId: tournament.managerId,
                        organizerPixKey: tournament.organizerPixKey,
                        organizerPixKeyType: tournament.organizerPixKeyType,
                        organizerPixRecipientName:
                            tournament.organizerPixRecipientName,
                        organizerPixCity: tournament.organizerPixCity,
                        partnerJoinsFree: paidAwaitingPartner,
                        showSoloPartnerInvite: awaitingPartner,
                        onInvitePartner: awaitingPartner
                            ? _openPartnerInvite
                            : null,
                        // Uniforme mora no cartão da tela de inscrição.
                        showInformUniform: false,
                        cancellationSection:
                            TournamentRegistrationCancellationSection(
                              snapshot: snap,
                              onCancelDirectly:
                                  (!_submitting &&
                                      snap != null &&
                                      registrationCancellableByAthlete(
                                        isPaid: snap.isPaid,
                                        sharePaidUids: snap.sharePaidUids,
                                        paidAmount: snap.paidAmount,
                                      ))
                                  ? _confirmCancelRegistration
                                  : null,
                              onRequestCancellation:
                                  (!_submitting && snap != null)
                                  ? () =>
                                        _openCancellationRequestSheet(tournament)
                                  : null,
                              onContactOrganizer: () =>
                                  _openOrganizerWhatsApp(tournament),
                              contactBusy: _contactingOrganizer,
                            ),
                      ),
                      if (snap != null && snap.teamSize != null) ...[
                        const SizedBox(height: AppSpacing.lg),
                        TournamentRegistrationRosterCard(
                          teamName: snap.teamName,
                          members: _teamRoster(snap),
                          remainingSlots: remainingTeamInviteSlots(
                            teamSize: snap.teamSize,
                            rosterCount: snap.participantUids.length,
                            pendingInviteCount: sentPendingInvitesFor(
                              invites:
                                  ref
                                      .watch(
                                        inviterTournamentPartnerInvitesProvider,
                                      )
                                      .valueOrNull ??
                                  const <TournamentPartnerInvite>[],
                              tournamentId: widget.tournamentId,
                              categoryId: category.id,
                            ).length,
                          ),
                          leaving: _leavingTeam,
                          onLeaveTeam:
                              canLeaveTeamRegistration(
                                teamSize: snap.teamSize,
                                captainUid: snap.captainUid ?? snap.player1Id,
                                myUid: currentUid,
                                isPaid: snap.isPaid,
                                sharePaidUids: snap.sharePaidUids,
                              )
                              ? () => _leaveTeam(snap)
                              : null,
                        ),
                      ],
                    ],
                  ),
                ),
                TournamentRegistrationStickyBar(
                  enabled: ctaEnabled,
                  submitting: _submitting,
                  onConfirm: () => _submitPayment(
                    tournament: tournament,
                    category: category,
                    quote: quote,
                  ),
                  ctaLabel: athleteSharePaid
                      ? 'Aguardando parceiro'
                      : isFree
                      ? 'Confirmar inscrição'
                      : isDirectOrganizer
                      ? 'Já paguei ao organizador'
                      : 'Confirmar e pagar',
                  ctaSubtitle: isDirectOrganizer && !athleteSharePaid
                      ? 'pagamento direto com o organizador'
                      : null,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
