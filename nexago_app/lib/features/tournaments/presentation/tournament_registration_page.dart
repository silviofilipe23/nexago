import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../../core/ui/feedback/show_feedback_page.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_section_header.dart';
import '../../../core/ui/nexa_share.dart';
import '../../../core/ui/nexa_segmented_control.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/data/payment_service.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../arenas/domain/payment_providers.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/profile_access.dart'
    show formatMissingProfileStepsForAccess;
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
import '../domain/tournament_invite_announcer.dart';
import '../domain/tournament_invite_links.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_registration_navigation.dart';
import '../domain/tournament_registration_pix_args.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_team_roster_logic.dart';
import '../domain/uniform_auto_saver.dart';
import 'widgets/tournament_registration/tournament_registration_category_card.dart';
import 'widgets/tournament_registration/tournament_registration_header.dart';
import 'widgets/tournament_registration/tournament_registration_hero_card.dart';
import 'widgets/tournament_registration/level_confirmation_sheet.dart';
import 'widgets/tournament_registration/tournament_registration_partner_step.dart';
import 'widgets/tournament_registration/tournament_cancellation_request_sheet.dart';
import 'widgets/tournament_registration/tournament_registration_cancellation_section.dart';
import 'widgets/tournament_registration/tournament_registration_payment_step.dart';
import 'widgets/tournament_registration/tournament_registration_price_summary.dart';
import 'widgets/tournament_registration/tournament_registration_roster_card.dart';
import 'widgets/tournament_registration/tournament_registration_received_invite_card.dart';
import 'widgets/tournament_registration/tournament_registration_sent_invites_list.dart';
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

  /// Saída da equipe em voo.
  bool _leavingTeam = false;

  /// Gravação automática do uniforme: escolher já salva, sem botão.
  UniformSaveState _uniformSaveState = UniformSaveState.idle;
  late final UniformAutoSaver _uniformSaver = UniformAutoSaver(
    save: _writeUniform,
    onStateChange: (state) {
      if (mounted) setState(() => _uniformSaveState = state);
    },
  );

  /// Geração do link de convite em voo — trava só o cartão "Convidar por
  /// link".
  bool _sharingExternalInvite = false;

  /// Convite da lista com cancelamento em voo — trava só a linha dele, não a
  /// tela inteira.
  String? _cancelingInviteId;

  /// Inscrição cujo uniforme gravado já foi trazido para a tela. Uma vez por
  /// inscrição: depois disso quem manda é o que o atleta está editando, senão
  /// cada snapshot novo desfaria a escolha em andamento.
  String? _uniformHydratedRegistrationId;
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

  @override
  void dispose() {
    _uniformSaver.dispose();
    super.dispose();
  }

  /// Gravação de verdade por trás do auto-save.
  Future<void> _writeUniform(TournamentUniformSelection selection) async {
    final regId = _registrationId?.trim() ?? '';
    if (regId.isEmpty) {
      throw TournamentPartnerInviteException(
        'Sua inscrição ainda não foi criada.',
      );
    }
    await ref
        .read(tournamentPartnerInviteServiceProvider)
        .setRegistrationUniform(registrationId: regId, uniform: selection);
  }

  /// Escolheu → grava sozinho. Antes da vaga existir não há onde gravar: aí o
  /// uniforme viaja junto do convite (`inviterUniform`).
  void _onUniformChanged(TournamentUniformSelection value) {
    setState(() => _titularUniform = value);
    final category = _category;
    if (category == null) return;
    if ((_registrationId?.trim() ?? '').isEmpty) return;
    if (!isUniformSelectionComplete(category: category, selection: value)) {
      // Meia escolha não vira gravação — e nem vira erro enquanto o atleta
      // ainda está decidindo.
      _uniformSaver.cancelPending();
      return;
    }
    _uniformSaver.schedule(value);
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

  /// Traz o uniforme JÁ gravado na inscrição para o cartão da tela.
  ///
  /// A vaga nasce sem uniforme (`uniform: null`) e a escolha pode ter sido
  /// feita depois — inclusive por outra superfície. Sem isso o cartão abria nos
  /// padrões (M/10/sobrenome) mesmo para quem tinha escolhido GG, e salvar
  /// apagava a escolha real.
  void _scheduleUniformHydration(TournamentRegistrationSnapshot? snap) {
    final regId = snap?.registrationId.trim() ?? '';
    if (regId.isEmpty || _uniformHydratedRegistrationId == regId) return;
    final category = _category;
    if (category == null || !categoryRequiresUniform(category)) return;
    final uid = ref.read(authServiceProvider).currentUser?.uid ?? '';
    if (uid.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _uniformHydratedRegistrationId == regId) return;
      final hydrated = hydrateUniformSelection(
        stored: snap!.uniformFor(uid),
        defaults: _defaultUniformForCategory(category),
      );
      setState(() {
        _uniformHydratedRegistrationId = regId;
        _titularUniform = hydrated;
      });
      // O que veio do servidor já está gravado: semear evita uma escrita
      // redundante e deixa o selo honesto desde a abertura.
      final stored = snap.uniformFor(uid);
      if (isUniformSelectionComplete(category: category, selection: stored)) {
        _uniformSaver.markSaved(stored);
      }
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
    final athleteRank = CategoryLevelEligibility.athleteLevelRank(
      profile,
      tournamentSport: tournamentSport,
    );
    if (!CategoryLevelEligibility.isCategoryEligibleForLevel(
      category,
      athleteRank,
    )) {
      // Teto excedido (categoria abaixo do nível do atleta) → mensagem
      // atual; senão o bloqueio é o PISO (`minLevel`) da categoria.
      final aboveCeiling =
          CategoryLevelEligibility.categoryLevelRank(category) < athleteRank;
      showAppSnackBar(
        context,
        aboveCeiling
            ? CategoryLevelEligibility.blockMessage(
                profile,
                tournamentSport: tournamentSport,
              )
            : CategoryLevelEligibility.minLevelBlockMessage(
                category,
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

  /// Última chance de revisar o nível antes de travar o ratchet "nível só
  /// sobe" (plano de calibração de nível, Task 6): só aparece quando esta é
  /// a PRIMEIRA inscrição do atleta naquele esporte
  /// (`levelLocked[sportCode] != true`); depois de travado, nunca mais.
  /// Retorna false se o atleta não confirmou (fechou o sheet ou pediu para
  /// ajustar o nível — nesse caso já navega para "Esportes e níveis").
  ///
  /// Usa `resolveLevelConfirmationPrompt` com `athleteProfileProvider.future`
  /// (não `.valueOrNull`): o perfil ainda carregando não pode ser lido como
  /// "sem perfil" — isso faria o gate pular em silêncio (achado do review,
  /// I1). Qualquer erro no stream cai no mesmo aviso genérico já usado pelas
  /// outras ações desta tela e BLOQUEIA a submissão (nunca decide o gate com
  /// o perfil ausente).
  Future<bool> _ensureLevelConfirmed(String? tournamentSport) async {
    final LevelConfirmationPrompt? prompt;
    try {
      prompt = await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
        ref.read(athleteProfileProvider.future),
        tournamentSport: tournamentSport,
      );
    } catch (_) {
      if (!mounted) return false;
      showAppSnackBar(
        context,
        'Não foi possível confirmar seu nível. Tente novamente.',
        isError: true,
      );
      return false;
    }
    if (!mounted) return false;
    if (prompt == null) return true;
    final confirmed = await showLevelConfirmationSheet(
      context,
      levelLabel: prompt.levelLabel,
      sportLabel: prompt.sportLabel,
    );
    if (!mounted) return false;
    if (confirmed != true) {
      if (confirmed == false) {
        context.pushNamed(AppRouteNames.athleteSportsLevels);
      }
      return false;
    }
    return true;
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
      final result = await inviteService.sendInvite(
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
        _inviteId = result.inviteId;
        _step = TournamentRegistrationStep.waiting;
      });
      final firstName = partner.name.split(' ').first;
      // Parceiro com cadastro incompleto não consegue aceitar: sem este aviso
      // o convite ficava "aguardando" até expirar sem ninguém saber o motivo.
      final missing =
          formatMissingProfileStepsForAccess(result.inviteeMissingSteps);
      showAppSnackBar(
        context,
        result.inviteeProfileReady
            ? 'Convite enviado para $firstName.'
            : 'Convite enviado! Avise $firstName: falta completar '
                '${missing.isEmpty ? 'o cadastro' : missing} '
                'no perfil para poder aceitar.',
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

  /// Inscrição solo: garante a vaga sem parceiro. Em categoria de EQUIPE
  /// (trio+), a vaga nasce como equipe NOMEADA — o nome é pedido aqui e a
  /// callable é outra ([createTeamRegistration]); o resto do fluxo (pagamento,
  /// convites) segue igual. Retorna true em sucesso.
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
    String? teamName;
    if (cat.isTeamCategory) {
      teamName = await _promptTeamName(cat);
      if (teamName == null || !mounted) return false;
    }
    if (!await _ensureLgpdConsent() || !mounted) return false;
    if (!await _ensureLevelConfirmed(tournament.sport)) return false;
    setState(() => _submitting = true);
    try {
      final service = ref.read(tournamentPartnerInviteServiceProvider);
      final String registrationId;
      if (teamName != null) {
        final created = await service.createTeamRegistration(
          tournamentId: tournament.id,
          categoryId: cat.id,
          teamName: teamName,
          // Uniforme é coletado depois (pós-inscrição), não bloqueia a vaga.
          uniform: null,
          lgpdAccepted: true,
        );
        registrationId = created.registrationId;
      } else {
        registrationId = await service.registerSolo(
          tournamentId: tournament.id,
          categoryId: cat.id,
          uniform: null,
          lgpdAccepted: true,
        );
      }
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
          teamName != null
              ? 'Equipe $teamName criada! Pague sua cota e convide os '
                    'atletas — cada um paga a própria parte.'
              : 'Vaga garantida! Pague a metade ou o total — pagando o total, '
                    'seu parceiro entra sem taxa.',
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

  /// Nome da equipe (categoria trio/quarteto/quinteto) — mesmas regras do
  /// backend: 3 a 30 caracteres após colapsar espaços. Retorna null se o
  /// atleta desistir.
  Future<String?> _promptTeamName(TournamentCategoryOffer category) async {
    final controller = TextEditingController();
    try {
      return await showDialog<String>(
        context: context,
        builder: (dialogContext) {
          String? errorText;
          return StatefulBuilder(
            builder: (context, setDialogState) {
              return AlertDialog(
                title: Text('Nome da equipe (${category.formatLabel})'),
                content: TextField(
                  controller: controller,
                  autofocus: true,
                  maxLength: 40,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    hintText: 'Ex.: ${category.formatLabel} Calango',
                    errorText: errorText,
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: const Text('Cancelar'),
                  ),
                  FilledButton(
                    onPressed: () {
                      final name = controller.text
                          .replaceAll(RegExp(r'\s+'), ' ')
                          .trim();
                      if (name.length < 3) {
                        setDialogState(
                          () => errorText =
                              'O nome precisa ter pelo menos 3 caracteres.',
                        );
                        return;
                      }
                      if (name.length > 30) {
                        setDialogState(
                          () => errorText =
                              'O nome pode ter no máximo 30 caracteres.',
                        );
                        return;
                      }
                      Navigator.of(dialogContext).pop(name);
                    },
                    child: const Text('Criar equipe'),
                  ),
                ],
              );
            },
          );
        },
      );
    } finally {
      controller.dispose();
    }
  }

  /// Encerra o passo do uniforme.
  ///
  /// A escolha já grava sozinha (ver [_uniformSaver]); este botão só garante
  /// que o debounce não fique pendente e devolve o atleta ao pagamento. Sem
  /// inscrição não há onde gravar — a escolha viaja junto do convite.
  void _finishUniformStep() {
    final cat = _category;
    if (cat == null) return;
    final msg = validateUniformSelection(
      category: cat,
      selection: _titularUniform,
    );
    if (msg != null) {
      showAppSnackBar(context, msg, isError: true);
      return;
    }
    if ((_registrationId?.trim() ?? '').isNotEmpty) {
      _uniformSaver.saveNow(_titularUniform);
    }
    _goToStep(
      (_registrationId?.trim() ?? '').isNotEmpty
          ? TournamentRegistrationStep.payment
          : TournamentRegistrationStep.category,
    );
  }

  /// Convida por LINK quem ainda não tem conta no nexaGO.
  ///
  /// O convite de verdade exige um `inviteeUid`, que não existe antes do
  /// cadastro: o backend cria um token de uso único, o link carrega esse token
  /// mais o código de indicação, e o convite nasce sozinho quando o parceiro
  /// termina o cadastro. Antes isto era um snackbar dizendo "em breve".
  Future<void> _shareExternalInvite(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
  ) async {
    if (_sharingExternalInvite) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    setState(() => _sharingExternalInvite = true);
    try {
      final externalInviteId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .createExternalInvite(
            tournamentId: tournament.id,
            categoryId: category.id,
          );
      if (!mounted) return;
      final athlete = _athleteDisplay();
      final url = externalPartnerInviteUrl(
        externalInviteId: externalInviteId,
        referralCode: ref.read(authServiceProvider).currentUser?.uid,
        inviterName: athlete.name,
      );
      if (url == null) {
        showAppSnackBar(
          context,
          'Não foi possível gerar o link do convite.',
          isError: true,
        );
        return;
      }
      await nexaShareText(
        context,
        externalPartnerInviteMessage(
          partnerName: null,
          tournamentName: tournament.name,
          categoryName: category.name,
          url: url,
          teamName: category.isTeamCategory ? _teamNameOfRegistration() : null,
        ),
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _sharingExternalInvite = false);
    }
  }

  /// Nome da equipe já criada, para o texto do convite falar dela.
  String? _teamNameOfRegistration() {
    final regId = _registrationId?.trim() ?? '';
    if (regId.isEmpty) return null;
    return ref
        .read(tournamentRegistrationSnapshotProvider(regId))
        .valueOrNull
        ?.teamName;
  }

  /// Cutuca o parceiro que ainda não respondeu, pelo share sheet do sistema.
  ///
  /// O link é absoluto e no host do portal do atleta: quem tem o app cai no
  /// convite dentro do app, quem não tem cai na web. Antes isto era um
  /// snackbar exibindo `/torneios-convite/<id>` — um caminho cru, que não é
  /// endereço nenhum e não dava para compartilhar.
  Future<void> _shareInviteReminder({
    required TournamentDetail tournament,
    required String partnerName,
    String? teamName,
  }) async {
    final url = tournamentPartnerInviteUrl(_inviteId);
    if (url == null) {
      showAppSnackBar(context, 'Aguardando envio do convite.');
      return;
    }
    await nexaShareText(
      context,
      partnerInviteReminderMessage(
        partnerName: partnerName,
        tournamentName: tournament.name,
        categoryName: _category?.name ?? _category?.id ?? '',
        url: url,
        teamName: teamName,
      ),
    );
  }

  /// Confirmação antes de declarar o pagamento direto ao organizador.
  ///
  /// A declaração é por honra e sem desfazer pelo app: quem clicar sem ter
  /// pago aciona o organizador à toa. A pergunta diz o valor para o atleta
  /// conferir contra o comprovante.
  Future<bool> _confirmDirectPaymentDeclaration(
    TournamentRegistrationQuote quote,
  ) async {
    final payFull = _canPayFull && _paymentType == 'full';
    final amount = payFull ? quote.displayTotal : quote.shareAmount;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar pagamento?'),
        content: Text(
          'Você está informando que já pagou ${formatRegistrationMoney(amount)} '
          'direto ao organizador. Ele será avisado e vai conferir o '
          'recebimento — não dá para desfazer por aqui.',
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

  /// Elenco da equipe para o cartão, com nome e foto de cada integrante.
  ///
  /// Perfil que não carregou não some do elenco: a linha aparece com
  /// "Você"/"Atleta" (ver [buildTeamRoster]).
  List<TournamentRosterMember> _teamRoster(
    TournamentRegistrationSnapshot snap,
  ) {
    final profiles = ref
            .watch(
              registrationRosterProfilesProvider(snap.participantUids),
            )
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

  /// Integrante sai da equipe: a vaga reabre e o capitão é avisado.
  ///
  /// A callable já existia e nunca tinha sido chamada pela UI — não havia como
  /// sair de uma equipe pelo app.
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
        if (context.mounted) {
          showAppSnackBar(context, 'Você saiu da equipe.');
        }
      });
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _leavingTeam = false);
    }
  }

  /// Cancela UM convite da lista de enviados.
  ///
  /// Diferente de [_cancelInvite], não mexe no passo nem na inscrição: o
  /// convite em destaque segue de pé e a vaga continua reservada — o atleta só
  /// desistiu de chamar aquela pessoa.
  Future<void> _cancelSentInvite(TournamentPartnerInvite invite) async {
    if (_cancelingInviteId != null) return;
    setState(() => _cancelingInviteId = invite.id);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelInvite(invite.id);
      if (!mounted) return;
      final firstName = invite.inviteeName.trim().split(' ').first;
      showAppSnackBar(
        context,
        firstName.isEmpty
            ? 'Convite cancelado.'
            : 'Convite para $firstName cancelado.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _cancelingInviteId = null);
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
          _finishUniformStep();
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
              ? (payFull
                    ? 'Total da ${quote?.unitSingular ?? 'dupla'}'
                    : 'Sua parte')
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
          ctaLabel: 'Pronto',
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
      body: NexaAsyncView<TournamentDetail?>(
        value: tournamentAsync,
        onRetry: () =>
            ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
        errorTitle: 'Não foi possível carregar',
        errorMessage: 'Não foi possível carregar o torneio.',
        skeleton: _buildStepSkeleton(context),
        emptyWhen: (value) => value == null,
        empty: AppEmptyView(
          icon: Icons.emoji_events_outlined,
          title: 'Torneio não encontrado',
          subtitle:
              'O torneio pode ter sido removido ou o link está desatualizado.',
          actionLabel: 'Voltar',
          onAction: _exitRegistration,
        ),
        data: (value) {
          final tournament = value!;

          final categories = tournament.categoryOffers;
          if (categories.isEmpty) {
            return AppEmptyView(
              icon: Icons.category_outlined,
              title: 'Nenhuma categoria disponível',
              subtitle:
                  'Nenhuma categoria deste torneio está aberta para inscrição.',
              actionLabel: 'Voltar',
              onAction: _exitRegistration,
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
          _scheduleUniformHydration(registrationSnap);

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
              ? buildRegistrationQuote(
                  entryFee: _category!.entryFee,
                  teamSize: _category!.rosterSize,
                )
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
          final directState = registrationSnap == null
              ? DirectPaymentState.idle
              : resolveDirectPaymentState(
                  isPaid: registrationSnap.isPaid,
                  sharePaidUids: registrationSnap.sharePaidUids,
                  myUid: currentUid,
                  declaredPaidAt: registrationSnap.declaredPaidAt,
                  paymentVerifiedByOrganizer:
                      registrationSnap.paymentVerifiedByOrganizer,
                );
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
                  directPaymentState:
                      tournamentUsesDirectOrganizerPayment(tournament)
                          ? directState
                          : null,
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
                  // Horizontal fica zerado porque o hero é full-bleed; todo o
                  // resto do conteúdo usa um único padding de tela abaixo.
                  padding: EdgeInsets.fromLTRB(
                    0,
                    showHeroSection ? 0 : AppSpacing.sm,
                    0,
                    AppSpacing.xxl,
                  ),
                  children: [
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
                      const SizedBox(height: AppSpacing.lg),
                    ],
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.screenH,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (!access.canAccess)
                            TournamentAccessBanner(
                              onboardingCompleted: access.onboardingCompleted,
                              blockMessage: access.blockMessage,
                              missingStepTitles: access.missingStepTitles,
                            ),
                          if (access.canAccess)
                            ..._buildStepContent(
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
                        ],
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

  /// Vazio dos passos que dependem de uma categoria escolhida — sempre com
  /// saída (o voltar do passo), nunca um beco sem ação.
  Widget _missingCategoryEmpty() {
    return AppEmptyView(
      icon: Icons.category_outlined,
      title: 'Escolha uma categoria',
      subtitle: 'Selecione uma categoria para continuar.',
      actionLabel: 'Voltar',
      onAction: _handleBack,
    );
  }

  /// Silhueta do passo atual enquanto o torneio carrega — o layout final já é
  /// conhecido, então nada de spinner.
  Widget _buildStepSkeleton(BuildContext context) {
    final showHero = registrationStepShowsHero(_step);
    final topInset = MediaQuery.paddingOf(context).top;
    final isCategoryStep = _step == TournamentRegistrationStep.category;

    return ListView(
      padding: EdgeInsets.fromLTRB(
        0,
        showHero ? 0 : AppSpacing.sm,
        0,
        AppSpacing.xxl,
      ),
      children: [
        if (showHero) ...[
          NexaSkeleton(height: topInset + 248, radius: BorderRadius.zero),
          const SizedBox(height: AppSpacing.lg),
        ],
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const NexaSkeleton(width: 168, height: 18),
              const SizedBox(height: AppSpacing.lg),
              if (isCategoryStep) ...[
                const NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                const SizedBox(height: AppSpacing.md),
                const NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                const SizedBox(height: AppSpacing.md),
                const NexaSkeleton(height: 96, radius: AppRadii.lgAll),
              ] else ...[
                const NexaSkeleton(height: 220, radius: AppRadii.lgAll),
                const SizedBox(height: AppSpacing.md),
                const NexaSkeleton(height: 120, radius: AppRadii.lgAll),
              ],
            ],
          ),
        ),
      ],
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
        // Convite recebido para a categoria escolhida: responder aqui evita
        // depender de o atleta achar a Agenda ou a notificação.
        final receivedInvite = receivedInviteForCategory(
          pending:
              ref.watch(pendingTournamentPartnerInvitesProvider).valueOrNull ??
                  const <TournamentPartnerInvite>[],
          tournamentId: widget.tournamentId,
          categoryId: _category?.id ?? '',
        );
        return [
          const NexaSectionHeader(
            title: 'Escolha a categoria',
            padding: EdgeInsets.zero,
          ),
          const SizedBox(height: AppSpacing.lg),
          if (receivedInvite != null) ...[
            TournamentRegistrationReceivedInviteCard(
              title: inviteAnnouncementTitle(receivedInvite),
              expiryLabel:
                  tournamentInviteExpiryLabel(receivedInvite.expiresAt),
              onOpenInvite: () => context.pushNamed(
                AppRouteNames.tournamentPartnerInvite,
                pathParameters: <String, String>{
                  'inviteId': receivedInvite.id,
                },
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
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
                  // Teto ok mas abaixo do piso (`minLevel`) → selo distinto.
                  belowMinLevel: CategoryLevelEligibility.categoryLevelRank(
                        cat,
                      ) >=
                          athleteLevelRank &&
                      athleteLevelRank <
                          CategoryLevelEligibility.categoryMinLevelRank(cat),
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
            const SizedBox(height: AppSpacing.md),
            NexaSegmentedControl<String>(
              segments: [
                const NexaSegment(value: 'share', label: 'Minha parte'),
                NexaSegment(
                  value: 'full',
                  label: 'Pagar a ${quote.unitSingular}',
                ),
              ],
              selected: _paymentType,
              onChanged: (value) => setState(() => _paymentType = value),
            ),
            const SizedBox(height: 6),
            Text(
              _paymentType == 'full'
                  ? quote.isTeamCategory
                        ? 'Você paga o total agora; o resto da equipe entra sem taxa.'
                        : 'Você paga o total agora; seu parceiro entra sem taxa.'
                  : quote.isTeamCategory
                  ? 'Você paga sua cota; cada atleta paga a dele ao entrar.'
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
          return [_missingCategoryEmpty()];
        }
        return [
          TournamentRegistrationUniformStep(
            tournament: tournament,
            category: uniformCategory,
            selection: _titularUniform,
            leagueBadge: tournament.name.toUpperCase(),
            onChanged: _onUniformChanged,
            // Sem inscrição não há onde gravar: o selo some em vez de mentir.
            saveState: (_registrationId?.trim().isNotEmpty ?? false)
                ? _uniformSaveState
                : null,
            onRetrySave: _uniformSaver.retry,
          ),
        ];
      case TournamentRegistrationStep.partner:
        final category = _category;
        if (category == null) {
          return [_missingCategoryEmpty()];
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
            onInviteByLink: () => _shareExternalInvite(tournament, category),
            onRegisterSolo: _registrationId == null
                ? () => _registerSolo(tournament)
                : null,
          ),
        ];
      case TournamentRegistrationStep.waiting:
        if (partner == null) {
          return [
            AppEmptyView(
              icon: Icons.person_search_outlined,
              title: 'Nenhum parceiro selecionado',
              subtitle: 'Selecione um parceiro para continuar.',
              actionLabel: 'Voltar',
              onAction: _handleBack,
            ),
          ];
        }
        final pendingInviteId = _inviteId?.trim() ?? '';
        final inviteAsync = pendingInviteId.isNotEmpty
            ? ref.watch(tournamentPartnerInviteProvider(pendingInviteId))
            : null;
        final invite = inviteAsync?.valueOrNull;
        final inviteLoading = inviteAsync?.isLoading ?? false;
        // Convidar mais de uma pessoa é caminho legítimo: o primeiro aceite
        // derruba os demais. O destaque acima é um convite só, então os outros
        // ficam listados aqui — antes eram invisíveis até expirar.
        final otherSentInvites = sentPendingInvitesFor(
          invites:
              ref.watch(inviterTournamentPartnerInvitesProvider).valueOrNull ??
                  const <TournamentPartnerInvite>[],
          tournamentId: widget.tournamentId,
          categoryId: _category?.id ?? '',
          excludeInviteId: pendingInviteId,
        );
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
            onResendInvite: () => _shareInviteReminder(
              tournament: tournament,
              partnerName: partner.name,
              teamName: invite?.teamName,
            ),
            onCancelRegistration: _cancelRegistrationFromWaiting,
          ),
          if (otherSentInvites.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            TournamentRegistrationSentInvitesList(
              invites: otherSentInvites,
              cancelingInviteId: _cancelingInviteId,
              onCancel: (invite) => _cancelSentInvite(invite),
            ),
          ],
        ];
      case TournamentRegistrationStep.payment:
        final category = _category;
        if (category == null || quote == null) {
          return [_missingCategoryEmpty()];
        }
        if (_registrationId == null || _registrationId!.isEmpty) {
          return [
            AppEmptyView(
              icon: Icons.hourglass_empty_rounded,
              title: 'Aguardando o parceiro',
              subtitle: 'Aguarde o parceiro aceitar o convite para pagar.',
              actionLabel: 'Voltar',
              onAction: _handleBack,
            ),
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
          // Categoria de EQUIPE: com quem vou jogar, quantas vagas faltam e a
          // saída de quem ainda não pagou a própria cota.
          if (registrationSnap != null && registrationSnap.teamSize != null) ...[
            const SizedBox(height: AppSpacing.lg),
            TournamentRegistrationRosterCard(
              teamName: registrationSnap.teamName,
              members: _teamRoster(registrationSnap),
              remainingSlots: remainingTeamInviteSlots(
                teamSize: registrationSnap.teamSize,
                rosterCount: registrationSnap.participantUids.length,
                pendingInviteCount: sentPendingInvitesFor(
                  invites: ref
                          .watch(inviterTournamentPartnerInvitesProvider)
                          .valueOrNull ??
                      const <TournamentPartnerInvite>[],
                  tournamentId: widget.tournamentId,
                  categoryId: category.id,
                ).length,
              ),
              leaving: _leavingTeam,
              onLeaveTeam: canLeaveTeamRegistration(
                teamSize: registrationSnap.teamSize,
                captainUid: registrationSnap.captainUid ??
                    registrationSnap.player1Id,
                myUid: ref.watch(authServiceProvider).currentUser?.uid,
                isPaid: registrationSnap.isPaid,
                sharePaidUids: registrationSnap.sharePaidUids,
              )
                  ? () => _leaveTeam(registrationSnap)
                  : null,
            ),
          ],
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
        ? buildRegistrationQuote(
            entryFee: category.entryFee,
            teamSize: category.rosterSize,
          )
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
        // Declarar não tem desfazer no app e aciona o organizador: o clique
        // acidental é caro, então vale perguntar antes.
        if (!await _confirmDirectPaymentDeclaration(quote)) return;
        final result = await ref
            .read(paymentServiceProvider)
            .reserveDirectOrganizerRegistration(registrationId: regId);
        if (!mounted) return;
        // Fica na tela: o estado pós-declaração (aguardando parceiro /
        // aguardando o organizador conferir) é justamente o que o atleta
        // precisa ver agora. Sair para "Meus torneios" escondia isso.
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
