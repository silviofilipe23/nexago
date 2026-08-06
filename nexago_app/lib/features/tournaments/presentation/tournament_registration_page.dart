import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/feedback/show_feedback_page.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../data/tournament_registration_service.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../domain/category_age_eligibility.dart';
import '../domain/category_gender_eligibility.dart';
import '../domain/category_level_eligibility.dart';
import '../domain/tournament_category_spots.dart';
import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_registration_navigation.dart';
import '../domain/tournament_registration_pix_args.dart';
import '../domain/tournament_registration_providers.dart';
import 'widgets/tournament_registration/tournament_registration_category_card.dart';
import 'widgets/tournament_registration/tournament_registration_header.dart';
import 'widgets/tournament_registration/tournament_registration_hero_card.dart';
import 'widgets/tournament_registration/tournament_registration_partner_step.dart';
import 'widgets/tournament_registration/tournament_cancellation_request_sheet.dart';
import 'widgets/tournament_registration/tournament_registration_cancellation_section.dart';
import 'widgets/tournament_registration/tournament_registration_payment_step.dart';
import 'widgets/tournament_registration/tournament_registration_price_summary.dart';
import 'widgets/tournament_registration/tournament_registration_sticky_bar.dart';
import 'widgets/tournament_registration/tournament_registration_uniform_step.dart';
import 'widgets/tournament_registration/tournament_registration_waiting_step.dart';
import 'widgets/lgpd_consent_sheet.dart';
import 'widgets/tournament_partner_invite_error_feedback.dart';

class TournamentRegistrationPage extends ConsumerStatefulWidget {
  const TournamentRegistrationPage({
    super.key,
    required this.tournamentId,
    this.initialCategoryId,
    this.initialRegistrationId,
    this.initialInviteId,
    this.initialStep,
  });

  final String tournamentId;
  final String? initialCategoryId;
  final String? initialRegistrationId;
  final String? initialInviteId;
  final TournamentRegistrationStep? initialStep;

  @override
  ConsumerState<TournamentRegistrationPage> createState() =>
      _TournamentRegistrationPageState();
}

class _TournamentRegistrationPageState
    extends ConsumerState<TournamentRegistrationPage> {
  TournamentRegistrationStep _step = TournamentRegistrationStep.category;
  TournamentCategoryOffer? _category;
  String? _partnerUserId;
  TournamentRegistrationPartnerCandidate? _selectedPartner;
  String? _inviteId;
  String? _registrationId;
  String _paymentType = 'share';
  bool _canPayFull = true;
  bool _submitting = false;
  bool _contactingOrganizer = false;
  /// Aceite do termo de uso de imagem/LGPD já confirmado nesta sessão do
  /// wizard — evita reabrir o sheet a cada ação (o aceite vai nas callables).
  bool _lgpdAccepted = false;
  bool _appliedInitialCategory = false;
  bool _appliedInitialRegistration = false;
  bool _appliedInitialInvite = false;
  bool _appliedSoloInviteRestore = false;
  bool _paidPopHandled = false;
  TournamentUniformSelection _titularUniform = const TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    sizeShorts: 'M',
  );

  @override
  void initState() {
    super.initState();
    final regId = widget.initialRegistrationId?.trim();
    if (regId != null && regId.isNotEmpty) {
      _registrationId = regId;
      _step = widget.initialStep ?? TournamentRegistrationStep.payment;
    }
    final invId = widget.initialInviteId?.trim();
    if (invId != null && invId.isNotEmpty) {
      _inviteId = invId;
      if (_step == TournamentRegistrationStep.category) {
        _step = widget.initialStep ?? TournamentRegistrationStep.waiting;
      }
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleRegistrationPaidCheck();
    });
  }

  void _scheduleInitialCategory(
    List<TournamentCategoryOffer> categories, {
    required Set<String> registeredCategoryIds,
    String? tournamentSport,
    DateTime? tournamentStart,
  }) {
    if (_appliedInitialCategory) return;
    final id = widget.initialCategoryId?.trim();
    if (id == null || id.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appliedInitialCategory) return;
      TournamentCategoryOffer? match;
      for (final c in categories) {
        if (c.id == id) {
          match = c;
          break;
        }
      }
      if (match == null || !isCategorySelectable(match)) return;
      if (registeredCategoryIds.contains(match.id)) return;
      final profile = ref.read(athleteProfileProvider).valueOrNull;
      if (!CategoryLevelEligibility.isCategoryEligibleForAthlete(
        match,
        profile,
        tournamentSport: tournamentSport,
      )) {
        return;
      }
      if (!CategoryAgeEligibility.isCategoryEligibleForAthlete(
        match,
        profile,
        tournamentStart: tournamentStart,
      )) {
        return;
      }
      if (!CategoryGenderEligibility.isCategoryEligibleForAthlete(
        match,
        profile,
      )) {
        return;
      }
      setState(() {
        _appliedInitialCategory = true;
        _category = match;
        _titularUniform = _defaultUniformForCategory(match!);
      });
    });
  }

  void _scheduleInitialInvite(List<TournamentCategoryOffer> categories) {
    if (_appliedInitialInvite) return;
    final invId = _inviteId?.trim();
    if (invId == null || invId.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || _appliedInitialInvite) return;
      final invite = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .watchInvite(invId)
          .first;
      if (!mounted || invite == null) return;

      TournamentCategoryOffer? match;
      for (final c in categories) {
        if (c.id == invite.categoryId) {
          match = c;
          break;
        }
      }

      final inviteeProfile = await ref
          .read(usersRepositoryProvider)
          .getUserById(invite.inviteeUid);
      final inviteeName = inviteeProfile != null
          ? appUserDisplayName(inviteeProfile)
          : invite.inviteeName;
      final inviteeInitials = inviteeProfile != null
          ? appUserInitials(inviteeProfile)
          : _initialsFromName(invite.inviteeName);
      final inviteeAvatar = inviteeProfile?.profilePhotoUrl;

      setState(() {
        _appliedInitialInvite = true;
        _inviteId = invite.id;
        if (match != null) _category = match;
        _partnerUserId = invite.inviteeUid;
        _selectedPartner = TournamentRegistrationPartnerCandidate(
          userId: invite.inviteeUid,
          initials: inviteeInitials,
          name: inviteeName,
          rankLabel: '',
          avatarUrl: inviteeAvatar,
        );
        if (invite.isAccepted &&
            invite.registrationId != null &&
            invite.registrationId!.isNotEmpty) {
          _registrationId = invite.registrationId;
          _step = TournamentRegistrationStep.payment;
        } else if (!invite.isAccepted) {
          _step = TournamentRegistrationStep.waiting;
        }
      });
    });
  }

  void _scheduleInitialRegistration(List<TournamentCategoryOffer> categories) {
    if (_appliedInitialRegistration) return;
    final regId = _registrationId;
    if (regId == null || regId.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _appliedInitialRegistration) return;
      final categoryId = widget.initialCategoryId?.trim();
      if (categoryId != null && categoryId.isNotEmpty) {
        for (final c in categories) {
          if (c.id == categoryId) {
            setState(() {
              _appliedInitialRegistration = true;
              _category = c;
            });
            return;
          }
        }
      }
      setState(() => _appliedInitialRegistration = true);
    });
  }

  void _scheduleRestoreSoloInvite({
    required TournamentRegistrationSnapshot? registrationSnap,
    required List<TournamentCategoryOffer> categories,
  }) {
    if (_appliedSoloInviteRestore) return;
    final regId = _registrationId?.trim();
    if (regId == null || regId.isEmpty) return;
    final invId = _inviteId?.trim();
    if (invId != null && invId.isNotEmpty) return;
    final awaitingPartner = registrationAwaitingSoloPartner(
          snap: registrationSnap,
          isFullyPaid: registrationSnap?.isPaid == true,
        ) ||
        registrationPaidAwaitingPartner(snap: registrationSnap);
    if (!awaitingPartner) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || _appliedSoloInviteRestore) return;
      final uid = ref.read(authServiceProvider).currentUser?.uid;
      if (uid == null || uid.isEmpty) return;

      final invites = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .watchInvitesAsInviter(uid)
          .first;
      if (!mounted || _appliedSoloInviteRestore) return;

      final categoryId =
          _category?.id ?? widget.initialCategoryId?.trim() ?? '';
      TournamentPartnerInvite? match;
      for (final invite in invites) {
        if (!invite.isPending || invite.isExpired) continue;
        if (invite.tournamentId != widget.tournamentId) continue;
        final attachId = invite.attachRegistrationId?.trim() ?? '';
        if (attachId.isNotEmpty) {
          if (attachId == regId) {
            match = invite;
            break;
          }
          continue;
        }
        if (categoryId.isNotEmpty && invite.categoryId == categoryId) {
          match = invite;
          break;
        }
      }

      if (match == null) {
        setState(() => _appliedSoloInviteRestore = true);
        return;
      }

      final inviteeProfile = await ref
          .read(usersRepositoryProvider)
          .getUserById(match.inviteeUid);
      final inviteeName = inviteeProfile != null
          ? appUserDisplayName(inviteeProfile)
          : match.inviteeName;
      final inviteeInitials = inviteeProfile != null
          ? appUserInitials(inviteeProfile)
          : _initialsFromName(match.inviteeName);
      final inviteeAvatar = inviteeProfile?.profilePhotoUrl;

      TournamentCategoryOffer? categoryMatch = _category;
      if (categoryMatch == null) {
        for (final c in categories) {
          if (c.id == match.categoryId) {
            categoryMatch = c;
            break;
          }
        }
      }

      if (!mounted) return;
      setState(() {
        _appliedSoloInviteRestore = true;
        _inviteId = match!.id;
        if (categoryMatch != null) _category = categoryMatch;
        _partnerUserId = match.inviteeUid;
        _selectedPartner = TournamentRegistrationPartnerCandidate(
          userId: match.inviteeUid,
          initials: inviteeInitials,
          name: inviteeName,
          rankLabel: '',
          avatarUrl: inviteeAvatar,
        );
      });
    });
  }

  void _openPartnerInviteFromPayment() {
    _syncTitularUniformFromProfile();
    _goToStep(TournamentRegistrationStep.partner);
  }

  void _syncTitularUniformFromProfile() {
    final cat = _category;
    if (cat == null) return;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final defaults = defaultUniformSelectionForCategory(
      cat,
      athleteName: profile?.name,
      athleteNickname: profile?.nickname,
    );
    setState(() {
      _titularUniform = fillJerseyNameDefaultIfNeeded(
        category: cat,
        selection: TournamentUniformSelection(
          sizeTop: _titularUniform.sizeTop ?? defaults.sizeTop,
          sizeShorts: _titularUniform.sizeShorts ?? defaults.sizeShorts,
          jerseyNumber: _titularUniform.jerseyNumber ?? defaults.jerseyNumber,
          jerseyName: _titularUniform.jerseyName ?? defaults.jerseyName,
        ),
        athleteName: profile?.name,
        athleteNickname: profile?.nickname,
      );
    });
  }

  void _selectCategory(
    TournamentCategoryOffer category, {
    String? tournamentSport,
    DateTime? tournamentStart,
  }) {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (!CategoryLevelEligibility.isCategoryEligibleForAthlete(
      category,
      profile,
      tournamentSport: tournamentSport,
    )) {
      showAppSnackBar(
        context,
        CategoryLevelEligibility.blockMessage(
          profile,
          tournamentSport: tournamentSport,
        ),
        isError: true,
      );
      return;
    }
    final ageEval = CategoryAgeEligibility.evaluate(
      category,
      profile,
      tournamentStart: tournamentStart,
    );
    if (ageEval != AgeEligibility.eligible) {
      showAppSnackBar(
        context,
        CategoryAgeEligibility.blockMessage(category, ageEval),
        isError: true,
      );
      return;
    }
    if (!CategoryGenderEligibility.isCategoryEligibleForAthlete(
      category,
      profile,
    )) {
      showAppSnackBar(
        context,
        CategoryGenderEligibility.blockMessage(category, profile),
        isError: true,
      );
      return;
    }
    setState(() {
      _category = category;
      _titularUniform = _defaultUniformForCategory(category);
    });
  }

  TournamentUniformSelection _defaultUniformForCategory(
    TournamentCategoryOffer category,
  ) {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    return defaultUniformSelectionForCategory(
      category,
      athleteName: profile?.name,
      athleteNickname: profile?.nickname,
    );
  }

  TournamentUniformSelection _uniformForInvite(TournamentCategoryOffer category) {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final filled = fillJerseyNameDefaultIfNeeded(
      category: category,
      selection: _titularUniform,
      athleteName: profile?.name,
      athleteNickname: profile?.nickname,
    );
    if (filled != _titularUniform) {
      setState(() => _titularUniform = filled);
    }
    return filled;
  }

  void _goToStep(TournamentRegistrationStep step) {
    setState(() => _step = step);
  }

  /// Sai da inscrição com pop quando há pilha; senão volta ao torneio/home.
  void _exitRegistration() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    final tournamentId = widget.tournamentId.trim();
    if (tournamentId.isNotEmpty) {
      context.goNamed(
        AppRouteNames.tournamentDetail,
        pathParameters: {'tournamentId': tournamentId},
      );
      return;
    }
    context.go(AppRoutes.discover);
  }

  void _navigateToRegistrationSuccess() {
    if (!mounted || _paidPopHandled) return;
    _paidPopHandled = true;

    final tournament = ref
        .read(tournamentDetailProvider(widget.tournamentId))
        .valueOrNull;
    if (tournament == null) return;

    final regId = _registrationId ?? '';
    if (regId.isEmpty) return;

    final categoryName =
        _category?.name ?? _category?.id ?? widget.initialCategoryId ?? '';

    navigateToTournamentRegistrationSuccess(
      context,
      ref: ref,
      tournamentId: widget.tournamentId,
      registrationId: regId,
      tournamentName: tournament.name,
      categoryName: categoryName,
    );
  }

  void _scheduleRegistrationPaidCheck() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _paidPopHandled) return;
      final regId = _registrationId ?? '';
      if (regId.isEmpty) return;
      final snap = ref
          .read(tournamentRegistrationSnapshotProvider(regId))
          .valueOrNull;
      if (snap?.isPaid != true) return;
      // Pago mas ainda sem parceiro (solo pagou o total): não vai para sucesso —
      // o atleta convida o parceiro grátis (passo de parceiro/pagamento). Mantém
      // o passo atual (ex.: deep link para o passo de parceiro).
      if (registrationPaidAwaitingPartner(snap: snap)) return;
      _navigateToRegistrationSuccess();
    });
  }

  void _handleBack() {
    final regId = _registrationId?.trim() ?? '';
    final partnerPending = regId.isNotEmpty
        ? ref
                  .read(tournamentRegistrationSnapshotProvider(regId))
                  .valueOrNull
                  ?.partnerPending ==
              true
        : false;

    switch (_step) {
      case TournamentRegistrationStep.category:
        _exitRegistration();
      case TournamentRegistrationStep.uniform:
        // Uniforme agora é pós-inscrição: volta ao pagamento se já há inscrição.
        _goToStep(
          _registrationId != null
              ? TournamentRegistrationStep.payment
              : TournamentRegistrationStep.category,
        );
      case TournamentRegistrationStep.partner:
        if (_registrationId != null && partnerPending) {
          _goToStep(TournamentRegistrationStep.payment);
        } else {
          _goToStep(previousStepFromPartner(_category));
        }
      case TournamentRegistrationStep.waiting:
        _exitRegistration();
      case TournamentRegistrationStep.payment:
        if (_inviteId != null) {
          _goToStep(TournamentRegistrationStep.waiting);
        } else {
          _exitRegistration();
        }
    }
  }

  void _showProfileAccessBlocked() {
    final access = ref.read(tournamentAccessStateProvider);
    final message = access.snackbarMessage;
    if (message != null && mounted) {
      showAppSnackBar(context, message, isError: true);
    }
  }

  /// Garante o aceite do termo de uso de imagem/LGPD antes de qualquer ação
  /// que crie inscrição/convite. Retorna false se o atleta não aceitou.
  Future<bool> _ensureLgpdConsent() async {
    if (_lgpdAccepted) return true;
    final accepted = await showLgpdConsentSheet(context);
    if (accepted && mounted) setState(() => _lgpdAccepted = true);
    return accepted;
  }

  Future<void> _sendInvite(TournamentDetail tournament) async {
    final cat = _category;
    final partner = _selectedPartner;
    if (cat == null || partner == null) return;

    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }

    if (!await _ensureLgpdConsent() || !mounted) return;

    final athlete = _athleteDisplay();
    final uniformSelection = _uniformForInvite(cat);
    final validationError = categoryRequiresUniform(cat)
        ? validateUniformSelection(
            category: cat,
            selection: uniformSelection,
          )
        : null;
    if (validationError != null) {
      if (!mounted) return;
      showAppSnackBar(context, validationError, isError: true);
      _goToStep(TournamentRegistrationStep.uniform);
      return;
    }

    setState(() => _submitting = true);

    try {
      final inviteService = ref.read(tournamentPartnerInviteServiceProvider);
      final inviteId = await inviteService.sendInvite(
        tournamentId: tournament.id,
        categoryId: cat.id,
        inviteeUid: partner.userId,
        inviteeName: partner.name,
        inviterName: athlete.name,
        inviterUniform: uniformPayloadForPartnerInvite(
          category: cat,
          selection: uniformSelection,
        ),
        lgpdAccepted: true,
      );
      if (!mounted) return;
      setState(() {
        _inviteId = inviteId;
        _step = TournamentRegistrationStep.waiting;
      });
      showAppSnackBar(
        context,
        'Convite enviado para ${partner.name.split(' ').first}.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível enviar o convite. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Caminho principal (tela única): garante a vaga (inscrição solo) e já
  /// segue para o pagamento — sem passos de uniforme/parceiro. Uniforme e
  /// parceiro ficam como ações opcionais pós-inscrição.
  Future<void> _registerAndPay(TournamentDetail tournament) async {
    if (_submitting) return;
    // Já existe inscrição (ex.: retomada) → vai direto ao pagamento.
    if (_registrationId != null && _registrationId!.trim().isNotEmpty) {
      await _submitPayment();
      return;
    }
    final created = await _registerSolo(tournament, showSnack: false);
    if (!created || !mounted) return;
    await _submitPayment();
  }

  /// Inscrição solo: garante a vaga sem parceiro. Retorna true em sucesso.
  /// [showSnack] controla o aviso (no caminho único o pagamento vem em seguida).
  Future<bool> _registerSolo(
    TournamentDetail tournament, {
    bool showSnack = true,
  }) async {
    final cat = _category;
    if (cat == null || _submitting) return false;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return false;
    }
    if (!await _ensureLgpdConsent() || !mounted) return false;
    setState(() => _submitting = true);
    try {
      final registrationId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .registerSolo(
            tournamentId: tournament.id,
            categoryId: cat.id,
            // Uniforme é coletado depois (pós-inscrição), não bloqueia a vaga.
            uniform: null,
            lgpdAccepted: true,
          );
      if (!mounted) return false;
      setState(() {
        _registrationId = registrationId;
        _partnerUserId = null;
        _selectedPartner = null;
        _inviteId = null;
        _step = TournamentRegistrationStep.payment;
      });
      if (showSnack) {
        showAppSnackBar(
          context,
          'Vaga garantida! Pague a metade ou o total — pagando o total, seu '
          'parceiro entra sem taxa.',
        );
      }
      return true;
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return false;
      await showTournamentPartnerInviteError(context, e);
      return false;
    } catch (_) {
      if (!mounted) return false;
      await pushErrorFeedback(
        context,
        title: 'Não foi possível garantir a vaga',
        description: 'Tente novamente em instantes.',
        primaryAction: FeedbackAction(
          label: 'Tentar novamente',
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
      return false;
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Salva o uniforme do atleta na inscrição (pós-inscrição) e volta ao passo
  /// de pagamento/conclusão.
  Future<void> _saveUniform(TournamentDetail tournament) async {
    final regId = _registrationId?.trim();
    final cat = _category;
    if (regId == null || regId.isEmpty || cat == null || _submitting) return;
    final msg = validateUniformSelection(
      category: cat,
      selection: _titularUniform,
    );
    if (msg != null) {
      showAppSnackBar(context, msg, isError: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .setRegistrationUniform(
            registrationId: regId,
            uniform: _titularUniform,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Uniforme salvo.');
      _goToStep(TournamentRegistrationStep.payment);
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancelInvite() async {
    final id = _inviteId;
    if (id == null || id.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref.read(tournamentPartnerInviteServiceProvider).cancelInvite(id);
      if (!mounted) return;
      await pushInfoFeedback(
        context,
        title: 'Convite cancelado',
        description: 'Você pode convidar outro parceiro.',
        primaryAction: FeedbackAction(
          label: 'Continuar',
          onPressed: () => Navigator.of(context).pop(),
        ),
      );
      final regId = _registrationId?.trim() ?? '';
      final partnerPending = regId.isNotEmpty
          ? ref
                    .read(tournamentRegistrationSnapshotProvider(regId))
                    .valueOrNull
                    ?.partnerPending ==
                true
          : false;
      setState(() {
        _inviteId = null;
        _partnerUserId = null;
        _selectedPartner = null;
        if (partnerPending) {
          _step = TournamentRegistrationStep.payment;
        } else {
          _registrationId = null;
          _step = TournamentRegistrationStep.partner;
        }
      });
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Pedido de cancelamento ao organizador (inscrição JÁ PAGA). A plataforma
  /// não estorna: o aviso disso é parte do formulário, não um detalhe.
  Future<void> _openCancellationRequestSheet(TournamentDetail tournament) async {
    final regId = _registrationId?.trim() ?? '';
    if (regId.isEmpty || _submitting) return;

    final controller = TextEditingController();
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => TournamentCancellationRequestSheet(
        controller: controller,
        tournamentName: tournament.name,
      ),
    );
    controller.dispose();
    if (reason == null || reason.trim().isEmpty || !mounted) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .requestRegistrationCancellation(
            registrationId: regId,
            reason: reason,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Pedido enviado. O organizador foi avisado.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Abre o WhatsApp do organizador — é por ali que o reembolso é acertado.
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
        showAppSnackBar(context, 'Não foi possível abrir o WhatsApp.',
            isError: true);
        return;
      }
      final launched =
          await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!mounted) return;
      if (!launched) {
        showAppSnackBar(context, 'Não foi possível abrir o WhatsApp.',
            isError: true);
      }
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _contactingOrganizer = false);
    }
  }

  /// "Cancelar inscrição" no passo aguardando: com inscrição criada, cancela a
  /// inscrição de verdade (a callable derruba os convites junto); sem inscrição
  /// ainda (convite direto), só o convite existe para cancelar.
  Future<void> _cancelRegistrationFromWaiting() async {
    final regId = _registrationId?.trim() ?? '';
    if (regId.isNotEmpty) {
      await _confirmCancelRegistration();
    } else {
      await _cancelInvite();
    }
  }

  Future<void> _confirmCancelRegistration() async {
    final regId = _registrationId;
    if (regId == null || regId.isEmpty || _submitting) return;

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
          .cancelRegistration(regId);
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

  void _handleStickyAction({
    required TournamentDetail tournament,
    required bool canAccess,
    required bool inviteAccepted,
  }) {
    if (!canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    switch (_step) {
      case TournamentRegistrationStep.category:
        // Caminho único: garante a vaga e já vai ao pagamento (sem passos de
        // uniforme/parceiro — viram opcionais pós-inscrição).
        if (_category != null && !_submitting) {
          _registerAndPay(tournament);
        }
      case TournamentRegistrationStep.uniform:
        final cat = _category;
        if (cat != null &&
            isUniformSelectionComplete(
              category: cat,
              selection: _titularUniform,
            )) {
          // Uniforme é informado depois da inscrição: salva no registro.
          _saveUniform(tournament);
        } else if (cat != null && mounted) {
          final msg = validateUniformSelection(
            category: cat,
            selection: _titularUniform,
          );
          showAppSnackBar(
            context,
            msg ?? 'Complete a escolha do uniforme.',
            isError: true,
          );
        }
      case TournamentRegistrationStep.partner:
        if (_partnerUserId != null && !_submitting) {
          final cat = _category;
          if (cat != null && categoryRequiresUniform(cat)) {
            final uniform = _uniformForInvite(cat);
            final msg = validateUniformSelection(
              category: cat,
              selection: uniform,
            );
            if (msg != null) {
              showAppSnackBar(context, msg, isError: true);
              _goToStep(TournamentRegistrationStep.uniform);
              return;
            }
          }
          _sendInvite(tournament);
        }
      case TournamentRegistrationStep.waiting:
        if (registrationWaitingCanProceed(
          inviteAccepted: inviteAccepted,
          registrationId: _registrationId,
        )) {
          _goToStep(TournamentRegistrationStep.payment);
        }
      case TournamentRegistrationStep.payment:
        final regId = _registrationId?.trim() ?? '';
        final snap = regId.isNotEmpty
            ? ref
                  .read(tournamentRegistrationSnapshotProvider(regId))
                  .valueOrNull
            : null;
        final currentUid = ref.read(authServiceProvider).currentUser?.uid;
        final callerSettled = snap?.isPaid == true ||
            currentAthleteSharePaid(
              sharePaidUids: snap?.sharePaidUids ?? const [],
              athleteUid: currentUid,
            );
        // Já fez a parte dele e falta parceiro → próxima ação é convidar.
        if (snap?.partnerPending == true && callerSettled) {
          _openPartnerInviteFromPayment();
          return;
        }
        if (canAccess && !_submitting && _registrationId != null) {
          _submitPayment();
        }
    }
  }

  ({
    bool enabled,
    String ctaLabel,
    String? metaLabel,
    String? totalLabel,
    String? ctaSubtitle,
    String? priceBoxLabel,
    String? priceBoxValue,
  })
  _stickyConfig({
    required TournamentDetail tournament,
    required TournamentRegistrationQuote? quote,
    required bool inviteAccepted,
    required bool isFullyPaid,
    required bool athleteSharePaid,
    bool paidAwaitingPartner = false,
  }) {
    switch (_step) {
      case TournamentRegistrationStep.category:
        final profile = ref.read(athleteProfileProvider).valueOrNull;
        final hasCategory = _category != null;
        final categoryEligible = hasCategory &&
            CategoryGenderEligibility.isCategoryEligibleForAthlete(
              _category!,
              profile,
            );
        final isFree = quote != null && !registrationRequiresPayment(quote);
        final isDirect = quote != null &&
            tournamentUsesDirectOrganizerPayment(tournament) &&
            registrationRequiresPayment(quote);
        final payFull = _canPayFull && _paymentType == 'full';
        final amount = quote == null
            ? null
            : (payFull ? quote.displayTotal : quote.shareAmount);
        return (
          enabled: categoryEligible && !_submitting,
          ctaLabel: !hasCategory
              ? 'Escolha a categoria'
              : isFree
              ? 'Confirmar inscrição'
              : isDirect
              ? 'Reservar minha vaga'
              : 'Pagar e garantir vaga',
          metaLabel: hasCategory && !isFree && !isDirect
              ? (payFull ? 'Total da dupla' : 'Sua parte')
              : null,
          totalLabel: hasCategory && !isFree && amount != null
              ? formatRegistrationMoney(amount)
              : null,
          ctaSubtitle: null,
          priceBoxLabel: null,
          priceBoxValue: null,
        );
      case TournamentRegistrationStep.uniform:
        final cat = _category;
        return (
          enabled:
              !_submitting &&
              cat != null &&
              isUniformSelectionComplete(
                category: cat,
                selection: _titularUniform,
              ),
          ctaLabel: 'Salvar uniforme',
          metaLabel: null,
          totalLabel: null,
          ctaSubtitle: null,
          priceBoxLabel: null,
          priceBoxValue: null,
        );
      case TournamentRegistrationStep.partner:
        return (
          enabled: _partnerUserId != null && !_submitting,
          ctaLabel: 'Enviar convite',
          metaLabel: null,
          totalLabel: null,
          ctaSubtitle: null,
          priceBoxLabel: null,
          priceBoxValue: null,
        );
      case TournamentRegistrationStep.waiting:
        final canPay = registrationWaitingCanProceed(
          inviteAccepted: inviteAccepted,
          registrationId: _registrationId,
        );
        final isFree = quote != null && !registrationRequiresPayment(quote);
        return (
          enabled: canPay,
          ctaLabel: isFree ? 'Confirmar inscrição' : 'Ir para pagamento',
          metaLabel: inviteAccepted ? null : 'Aguardando parceiro',
          totalLabel: quote != null && canPay && !isFree
              ? formatRegistrationMoney(quote.shareAmount)
              : null,
          ctaSubtitle: null,
          priceBoxLabel: null,
          priceBoxValue: null,
        );
      case TournamentRegistrationStep.payment:
        if (paidAwaitingPartner) {
          // Solo pagou o total: a única ação é convidar o parceiro (sem taxa).
          return (
            enabled: !_submitting,
            ctaLabel: 'Convidar parceiro',
            metaLabel: 'Parceiro entra sem taxa',
            totalLabel: null,
            ctaSubtitle: null,
            priceBoxLabel: null,
            priceBoxValue: null,
          );
        }
        final isFree = quote != null && !registrationRequiresPayment(quote);
        final isDirect =
            quote != null &&
            tournamentUsesDirectOrganizerPayment(tournament) &&
            registrationRequiresPayment(quote);
        return (
          enabled:
              _registrationId != null &&
              !isFullyPaid &&
              !athleteSharePaid &&
              !_submitting,
          ctaLabel: isFullyPaid
              ? 'Inscrição confirmada'
              : athleteSharePaid
              ? (isFree || isDirect ? 'Reservado' : 'Parcela paga')
              : isFree
              ? 'Confirmar inscrição'
              : isDirect
              ? 'Reservar minha vaga'
              : 'Confirmar e pagar',
          metaLabel: athleteSharePaid
              ? 'Aguardando parceiro'
              : isDirect
              ? null
              : (isFree ? 'Gratuito' : 'Sua parcela'),
          totalLabel: quote != null && !athleteSharePaid && !isFree && !isDirect
              ? formatRegistrationMoney(quote.shareAmount)
              : null,
          ctaSubtitle: isDirect && !athleteSharePaid && !isFullyPaid
              ? 'pagamento direto com o organizador'
              : null,
          priceBoxLabel: isDirect && !athleteSharePaid ? 'Inscrição' : null,
          priceBoxValue: isDirect && !athleteSharePaid
              ? formatRegistrationMoney(quote.displayTotal)
              : null,
        );
    }
  }

  ({String name, String initials, String? avatarUrl}) _athleteDisplay() {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    if (profile != null) {
      final name = athleteDisplayName(profile, fallback: '');
      if (name.isNotEmpty) {
        return (
          name: name,
          initials: athleteInitials(profile),
          avatarUrl: profile.avatarUrl,
        );
      }
    }
    return (name: 'Você', initials: 'VC', avatarUrl: profile?.avatarUrl);
  }

  static String _initialsFromName(String name) {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.length >= 2
          ? parts.first.substring(0, 2).toUpperCase()
          : parts.first.toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final access = ref.watch(tournamentAccessStateProvider);

    final inviteId = _inviteId ?? '';
    if (inviteId.isNotEmpty) {
      ref.listen(tournamentPartnerInviteProvider(inviteId), (prev, next) {
        final invite = next.valueOrNull;
        if (invite == null || !mounted) return;

        if (invite.isAccepted &&
            invite.registrationId != null &&
            invite.registrationId!.isNotEmpty) {
          if (_registrationId != invite.registrationId) {
            setState(() => _registrationId = invite.registrationId);
            _scheduleRegistrationPaidCheck();
          }
          if (_step == TournamentRegistrationStep.waiting) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              setState(() => _step = TournamentRegistrationStep.payment);
              _scheduleRegistrationPaidCheck();
            });
          }
        } else if (invite.isDeclined || invite.isCancelled) {
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (!mounted) return;
            await pushInfoFeedback(
              context,
              title: invite.isDeclined
                  ? 'Convite recusado'
                  : 'Convite cancelado',
              description: invite.isDeclined
                  ? 'Seu parceiro recusou o convite. Você pode convidar outra pessoa.'
                  : 'O convite foi cancelado. Você pode enviar um novo.',
              primaryAction: FeedbackAction(
                label: 'Continuar',
                onPressed: () => Navigator.of(context).pop(),
              ),
            );
            final regId = _registrationId?.trim() ?? '';
            final partnerPending = regId.isNotEmpty
                ? ref
                          .read(tournamentRegistrationSnapshotProvider(regId))
                          .valueOrNull
                          ?.partnerPending ==
                      true
                : false;
            setState(() {
              _inviteId = null;
              _partnerUserId = null;
              _selectedPartner = null;
              if (partnerPending) {
                _step = TournamentRegistrationStep.payment;
              } else {
                _registrationId = null;
                _step = TournamentRegistrationStep.partner;
              }
            });
          });
        } else if (invite.isExpired) {
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (!mounted) return;
            await pushAlertFeedback(
              context,
              title: 'Convite expirado',
              description: 'Envie um novo convite para formar a dupla.',
              primaryAction: FeedbackAction(
                label: 'Continuar',
                onPressed: () => Navigator.of(context).pop(),
              ),
            );
            final regId = _registrationId?.trim() ?? '';
            final partnerPending = regId.isNotEmpty
                ? ref
                          .read(tournamentRegistrationSnapshotProvider(regId))
                          .valueOrNull
                          ?.partnerPending ==
                      true
                : false;
            setState(() {
              _inviteId = null;
              _partnerUserId = null;
              _selectedPartner = null;
              if (partnerPending) {
                _step = TournamentRegistrationStep.payment;
              } else {
                _step = TournamentRegistrationStep.partner;
              }
            });
          });
        }
      });
    }

    final regId = _registrationId ?? '';
    if (regId.isNotEmpty) {
      ref.listen(tournamentRegistrationSnapshotProvider(regId), (prev, next) {
        final wasPaid = prev?.valueOrNull?.isPaid == true;
        final isPaid = next.valueOrNull?.isPaid == true;
        if (!isPaid || wasPaid || !mounted || _paidPopHandled) return;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || _paidPopHandled) return;
          _navigateToRegistrationSuccess();
        });
      });
    }

    final registrationAsync = regId.isNotEmpty
        ? ref.watch(tournamentRegistrationSnapshotProvider(regId))
        : null;
    final registrationSnap = registrationAsync?.valueOrNull;
    final isFullyPaid = registrationSnap?.isPaid == true;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: tournamentAsync.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: AppColors.brand)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o torneio.\n$e',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.live),
            ),
          ),
        ),
        data: (tournament) {
          if (tournament == null) {
            return Center(child: Text('Torneio não encontrado.'));
          }

          final categories = tournament.categoryOffers;
          if (categories.isEmpty) {
            return Center(
              child: Text('Nenhuma categoria disponível para inscrição.'),
            );
          }

          final registeredCategoryIds =
              ref
                  .watch(
                    tournamentUserRegisteredCategoryIdsProvider(
                      widget.tournamentId,
                    ),
                  )
                  .valueOrNull ??
              const <String>{};

          _scheduleInitialCategory(
            categories,
            registeredCategoryIds: registeredCategoryIds,
            tournamentSport: tournament.sport,
            tournamentStart: tournament.startDate,
          );
          _scheduleInitialRegistration(categories);
          _scheduleInitialInvite(categories);
          _scheduleRestoreSoloInvite(
            registrationSnap: registrationSnap,
            categories: categories,
          );

          final enrollmentAsync = ref.watch(
            tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
          );
          final enrollmentResolved = enrollmentAsync.hasValue;
          final enrollment =
              enrollmentAsync.valueOrNull ?? const <String, int>{};
          final stats = tournamentDetailStats(
            tournament,
            enrollmentByCategoryId: enrollment,
            enrollmentCountsResolved: enrollmentResolved,
          );
          final quote = _category != null
              ? buildRegistrationQuote(entryFee: _category!.entryFee)
              : null;

          final inviteAsync = inviteId.isNotEmpty
              ? ref.watch(tournamentPartnerInviteProvider(inviteId))
              : null;
          final invite = inviteAsync?.valueOrNull;
          final inviteAccepted = invite?.isAccepted == true;

          final paidAmount = registrationSnap?.paidAmount ?? 0;
          final sharePaidUids = registrationSnap?.sharePaidUids ?? const [];
          final currentUid = ref.watch(authServiceProvider).currentUser?.uid;
          final athleteSharePaid = currentAthleteSharePaid(
            sharePaidUids: sharePaidUids,
            athleteUid: currentUid,
          );
          // "Pagar o total" (integral): permitido inclusive no solo (garante a
          // vaga; o parceiro entra sem taxa depois). Exige só não haver parcela
          // já paga e a inscrição não estar quitada.
          _canPayFull = sharePaidUids.isEmpty && !isFullyPaid;
          final progressLabel = quote != null
              ? registrationDualPaymentProgressLabel(
                  quote: quote,
                  paidAmount: paidAmount,
                  isPaid: isFullyPaid,
                  sharePaidUids: sharePaidUids,
                  currentAthleteUid: currentUid,
                  isDirectOrganizerPayment:
                      tournamentUsesDirectOrganizerPayment(tournament) &&
                      registrationRequiresPayment(quote),
                )
              : null;

          // Atleta já fez a parte dele (pagou total/parte ou reservou) e ainda
          // não tem parceiro → próxima ação é convidar (sem bloquear).
          final settledAwaitingPartner =
              (registrationSnap?.partnerPending == true) &&
              (isFullyPaid || athleteSharePaid);
          final sticky = _stickyConfig(
            tournament: tournament,
            quote: quote,
            inviteAccepted: inviteAccepted,
            isFullyPaid: isFullyPaid,
            athleteSharePaid: athleteSharePaid,
            paidAwaitingPartner: settledAwaitingPartner,
          );
          final showHero = registrationStepShowsHero(_step);
          final athlete = _athleteDisplay();
          final partner = _selectedPartner;
          final topInset = MediaQuery.paddingOf(context).top;
          final hasCover = tournament.imageUrl?.trim().isNotEmpty == true;
          final showHeroSection = access.canAccess && showHero;

          return Column(
            children: [
              if (!showHeroSection)
                TournamentRegistrationHeader(
                  onBack: _handleBack,
                  title: registrationHeaderTitle(_step),
                  tournamentName: tournament.name,
                  tournamentDateLabel: tournament.dateLabel,
                  categoryLabel:
                      _step == TournamentRegistrationStep.waiting ||
                          _step == TournamentRegistrationStep.uniform
                      ? (_category?.name ?? _category?.id)
                      : null,
                  showTournamentInfo:
                      _step == TournamentRegistrationStep.waiting ||
                      _step == TournamentRegistrationStep.uniform,
                ),
              Expanded(
                child: ListView(
                  clipBehavior: Clip.none,
                  padding: EdgeInsets.fromLTRB(
                    0,
                    showHeroSection ? 0 : 8,
                    0,
                    24,
                  ),
                  children: [
                    if (!access.canAccess)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                        child: TournamentAccessBanner(
                          onboardingCompleted: access.onboardingCompleted,
                          blockMessage: access.blockMessage,
                          missingStepTitles: access.missingStepTitles,
                        ),
                      ),
                    if (showHeroSection) ...[
                      TournamentRegistrationHeroCard(
                        tournament: tournament,
                        stats: stats,
                        topInset: topInset,
                        toolbar: TournamentRegistrationHeader(
                          immersive: true,
                          onCover: hasCover,
                          onBack: _handleBack,
                          title: registrationHeaderTitle(_step),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (access.canAccess)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: _buildStepContent(
                            tournament: tournament,
                            categories: categories,
                            enrollmentByCategoryId: enrollment,
                            enrollmentCountsResolved: enrollmentResolved,
                            registeredCategoryIds: registeredCategoryIds,
                            quote: quote,
                            athleteName: athlete.name,
                            athleteInitials: athlete.initials,
                            athleteAvatarUrl: athlete.avatarUrl,
                            partner: partner,
                            inviteAccepted: inviteAccepted,
                            invite: invite,
                            registrationSnap: registrationSnap,
                            progressLabel: progressLabel,
                            isFullyPaid: isFullyPaid,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              TournamentRegistrationStickyBar(
                enabled: registrationStickyEnabled(
                  canAccess: access.canAccess,
                  stepEnabled: sticky.enabled,
                ),
                onConfirm: () => _handleStickyAction(
                  tournament: tournament,
                  canAccess: access.canAccess,
                  inviteAccepted: inviteAccepted,
                ),
                ctaLabel: sticky.ctaLabel,
                metaLabel: sticky.metaLabel,
                totalLabel: sticky.totalLabel,
                ctaSubtitle: sticky.ctaSubtitle,
                priceBoxLabel: sticky.priceBoxLabel,
                priceBoxValue: sticky.priceBoxValue,
                submitting: _submitting,
              ),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _buildStepContent({
    required TournamentDetail tournament,
    required List<TournamentCategoryOffer> categories,
    required Map<String, int> enrollmentByCategoryId,
    required bool enrollmentCountsResolved,
    required Set<String> registeredCategoryIds,
    required TournamentRegistrationQuote? quote,
    required String athleteName,
    required String athleteInitials,
    required String? athleteAvatarUrl,
    required TournamentRegistrationPartnerCandidate? partner,
    required bool inviteAccepted,
    required TournamentPartnerInvite? invite,
    required TournamentRegistrationSnapshot? registrationSnap,
    required String? progressLabel,
    required bool isFullyPaid,
  }) {
    switch (_step) {
      case TournamentRegistrationStep.category:
        final athleteProfile = ref.watch(athleteProfileProvider).valueOrNull;
        final athleteLevelRank = CategoryLevelEligibility.athleteLevelRank(
          athleteProfile,
          tournamentSport: tournament.sport,
        );
        return [
          Text(
            'Escolha a categoria',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          SizedBox(height: 16),
          for (final cat in categories) ...[
            Builder(
              builder: (context) {
                final ageEval = CategoryAgeEligibility.evaluate(
                  cat,
                  athleteProfile,
                  tournamentStart: tournament.startDate,
                );
                return TournamentRegistrationCategoryCard(
                  offer: cat,
                  format: tournament.format,
                  inscriptionCount: resolveInscriptionCountForOffer(
                    enrollmentByCategoryId,
                    cat,
                    countsResolved: enrollmentCountsResolved,
                  ),
                  selected: _category?.id == cat.id,
                  alreadyRegistered: registeredCategoryIds.contains(cat.id),
                  levelBlocked:
                      !CategoryLevelEligibility.isCategoryEligibleForLevel(
                        cat,
                        athleteLevelRank,
                      ),
                  ageBlocked: ageEval != AgeEligibility.eligible,
                  ageBlockLabel: CategoryAgeEligibility.blockBadgeLabel(ageEval),
                  genderBlocked:
                      !CategoryGenderEligibility.isCategoryEligibleForAthlete(
                        cat,
                        athleteProfile,
                      ),
                  onTap: () => _selectCategory(
                    cat,
                    tournamentSport: tournament.sport,
                    tournamentStart: tournament.startDate,
                  ),
                );
              },
            ),
            SizedBox(height: 10),
          ],
          // Resumo de preço aparece assim que uma categoria é escolhida
          // (passo "Resumo" fundido aqui — menos um toque).
          if (_category != null && quote != null) ...[
            const SizedBox(height: 14),
            TournamentRegistrationPriceSummary(quote: quote),
          ],
          // Escolha "minha parte" ou "total" direto na tela única (só PIX no
          // app; no direto o valor é acertado com o organizador).
          if (_category != null &&
              quote != null &&
              registrationRequiresPayment(quote) &&
              _canPayFull &&
              !tournamentUsesDirectOrganizerPayment(tournament)) ...[
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'share', label: Text('Minha parte')),
                ButtonSegment(value: 'full', label: Text('Pagar a dupla')),
              ],
              selected: {_paymentType},
              onSelectionChanged: (selection) {
                if (selection.isEmpty) return;
                setState(() => _paymentType = selection.first);
              },
            ),
            const SizedBox(height: 6),
            Text(
              _paymentType == 'full'
                  ? 'Você paga o total agora; seu parceiro entra sem taxa.'
                  : 'Você paga sua parte; o parceiro paga a dele ao entrar.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ];
      case TournamentRegistrationStep.uniform:
        final uniformCategory = _category;
        if (uniformCategory == null) {
          return const [Text('Selecione uma categoria para continuar.')];
        }
        return [
          TournamentRegistrationUniformStep(
            tournament: tournament,
            category: uniformCategory,
            selection: _titularUniform,
            leagueBadge: tournament.name.toUpperCase(),
            onChanged: (value) => setState(() => _titularUniform = value),
          ),
        ];
      case TournamentRegistrationStep.partner:
        final category = _category;
        if (category == null) {
          return const [Text('Selecione uma categoria para continuar.')];
        }
        return [
          TournamentRegistrationPartnerStep(
            category: category,
            selectedUserId: _partnerUserId,
            onSelected: (candidate) {
              setState(() {
                _partnerUserId = candidate.userId;
                _selectedPartner = candidate;
              });
            },
            onInviteByPhone: () {
              showAppSnackBar(context, 'Convite por celular em breve.');
            },
            onRegisterSolo: _registrationId == null
                ? () => _registerSolo(tournament)
                : null,
          ),
        ];
      case TournamentRegistrationStep.waiting:
        if (partner == null) {
          return const [Text('Selecione um parceiro para continuar.')];
        }
        final inviteLink = _inviteId != null
            ? '/torneios-convite/${_inviteId!}'
            : null;
        final pendingInviteId = _inviteId?.trim() ?? '';
        final inviteAsync = pendingInviteId.isNotEmpty
            ? ref.watch(tournamentPartnerInviteProvider(pendingInviteId))
            : null;
        final invite = inviteAsync?.valueOrNull;
        final inviteLoading = inviteAsync?.isLoading ?? false;
        final inviteExpired =
            invite != null && invite.expiresAt.isBefore(DateTime.now());
        final partnerSubtitle = inviteAccepted
            ? '${partner.name.split(' ').first} · confirmado'
            : inviteExpired
            ? 'Convite expirou · reenvie para o parceiro'
            : invite != null
            ? 'Pendente · ${tournamentInviteExpiryLabel(invite.expiresAt)}'
            : 'Pendente';
        final reservationHours = invite != null
            ? tournamentInviteReservationHoursLabel(
                invite.expiresAt,
                invite.createdAt,
              )
            : '24 horas';
        return [
          TournamentRegistrationWaitingStep(
            partner: partner,
            athleteDisplayName: athleteName,
            athleteInitials: athleteInitials,
            athleteAvatarUrl: athleteAvatarUrl,
            inviteAccepted: inviteAccepted,
            partnerPendingSubtitle: partnerSubtitle,
            reservationHoursLabel: reservationHours,
            isLoading: inviteLoading,
            onContinueBrowsing: _exitRegistration,
            onResendInvite: () {
              if (inviteLink != null) {
                showAppSnackBar(
                  context,
                  'Convite pendente. Compartilhe: $inviteLink',
                );
              } else {
                showAppSnackBar(context, 'Aguardando envio do convite.');
              }
            },
            onCancelRegistration: _cancelRegistrationFromWaiting,
          ),
        ];
      case TournamentRegistrationStep.payment:
        final category = _category;
        if (category == null || quote == null) {
          return const [Text('Selecione uma categoria para continuar.')];
        }
        if (_registrationId == null || _registrationId!.isEmpty) {
          return const [
            Text('Aguarde o parceiro aceitar o convite para pagar.'),
          ];
        }
        final isDirectOrganizer =
            tournamentUsesDirectOrganizerPayment(tournament) &&
            registrationRequiresPayment(quote);
        final awaitingSoloPartner = registrationAwaitingSoloPartner(
          snap: registrationSnap,
          isFullyPaid: isFullyPaid,
        );
        // Solo pagou o total: vaga garantida, falta convidar o parceiro grátis.
        final paidAwaitingPartner = registrationPaidAwaitingPartner(
          snap: registrationSnap,
        );
        final awaitingPartner = awaitingSoloPartner || paidAwaitingPartner;
        final hasPendingSoloInvite =
            awaitingPartner &&
            (_inviteId?.trim().isNotEmpty ?? false) &&
            !inviteAccepted;
        final pendingPartnerName = hasPendingSoloInvite
            ? (_selectedPartner?.name ?? invite?.inviteeName)
            : null;
        final effectiveProgressLabel = paidAwaitingPartner
            ? 'Vaga garantida! Você pagou o total — convide seu parceiro, '
                  'ele entra sem taxa.'
            : progressLabel;
        return [
          TournamentRegistrationPaymentStep(
            category: category,
            quote: quote,
            paymentType: _canPayFull ? _paymentType : 'share',
            onPaymentTypeChanged: (value) =>
                setState(() => _paymentType = value),
            dualPaymentOnly: !_canPayFull,
            progressLabel: effectiveProgressLabel,
            isFullyPaid: isFullyPaid,
            isFreeRegistration: !registrationRequiresPayment(quote),
            // Já pago e sem parceiro: esconde o painel "pague ao organizador";
            // mostra só o convite (parceiro entra sem taxa).
            isDirectOrganizerPayment: isDirectOrganizer && !paidAwaitingPartner,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            tournamentCity: tournament.city,
            organizerManagerId: tournament.managerId,
            organizerPixKey: tournament.organizerPixKey,
            organizerPixKeyType: tournament.organizerPixKeyType,
            organizerPixRecipientName: tournament.organizerPixRecipientName,
            organizerPixCity: tournament.organizerPixCity,
            partnerJoinsFree: paidAwaitingPartner,
            showSoloPartnerInvite: awaitingPartner,
            onInvitePartner: awaitingPartner
                ? _openPartnerInviteFromPayment
                : null,
            pendingPartnerName: pendingPartnerName,
            onTrackInvite: hasPendingSoloInvite
                ? () => _goToStep(TournamentRegistrationStep.waiting)
                : null,
            // Uniforme é informado depois: a inscrição já existe neste passo.
            showInformUniform: categoryRequiresUniform(category),
            onInformUniform: () =>
                _goToStep(TournamentRegistrationStep.uniform),
            // Sem pagamento cancela direto; com pagamento o caminho é pedir ao
            // organizador (a plataforma não estorna).
            cancellationSection: TournamentRegistrationCancellationSection(
              snapshot: registrationSnap,
              onCancelDirectly: (!_submitting &&
                      registrationSnap != null &&
                      registrationCancellableByAthlete(
                        isPaid: registrationSnap.isPaid,
                        sharePaidUids: registrationSnap.sharePaidUids,
                        paidAmount: registrationSnap.paidAmount,
                      ))
                  ? _confirmCancelRegistration
                  : null,
              onRequestCancellation:
                  (!_submitting && registrationSnap != null)
                      ? () => _openCancellationRequestSheet(tournament)
                      : null,
              onContactOrganizer: () => _openOrganizerWhatsApp(tournament),
              contactBusy: _contactingOrganizer,
            ),
          ),
        ];
    }
  }

  Future<void> _submitPayment() async {
    final regId = _registrationId;
    if (regId == null || regId.isEmpty) return;

    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }

    final tournament = ref
        .read(tournamentDetailProvider(widget.tournamentId))
        .valueOrNull;
    final category = _category;
    final quote = category != null
        ? buildRegistrationQuote(entryFee: category.entryFee)
        : null;
    if (tournament == null || category == null || quote == null) {
      showAppSnackBar(
        context,
        'Dados da inscrição incompletos.',
        isError: true,
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      if (!mounted) return;
      if (!registrationRequiresPayment(quote)) {
        final result = await ref
            .read(paymentServiceProvider)
            .confirmFreeTournamentRegistration(registrationId: regId);
        if (!mounted) return;
        if (result.isPaid) {
          _navigateToRegistrationSuccess();
          return;
        }
        showAppSnackBar(
          context,
          'Inscrição confirmada. Aguarde seu parceiro confirmar a dele.',
        );
        return;
      }

      if (tournamentUsesDirectOrganizerPayment(tournament)) {
        final result = await ref
            .read(paymentServiceProvider)
            .reserveDirectOrganizerRegistration(registrationId: regId);
        if (!mounted) return;
        final message = result.bothAthletesReserved
            ? 'Vaga reservada! Aguarde o organizador confirmar o pagamento.'
            : 'Vaga reservada. Convide seu parceiro para reservar a dele.';
        context.goNamed(AppRouteNames.myTournaments);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) showAppSnackBar(context, message);
        });
        return;
      }

      final amountType = (_canPayFull && _paymentType == 'full')
          ? 'full'
          : 'share';
      final amountReais = amountType == 'full'
          ? quote.displayTotal
          : quote.shareAmount;
      await context.pushNamed(
        AppRouteNames.tournamentRegistrationPix,
        pathParameters: <String, String>{'tournamentId': widget.tournamentId},
        queryParameters: <String, String>{
          'registrationId': regId,
          'categoryId': category.id,
          'tournamentName': tournament.name,
          'categoryName': category.name,
          'shareAmountReais': amountReais.toString(),
          'amountType': amountType,
        },
        extra: TournamentRegistrationPixArgs(
          registrationId: regId,
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
}
