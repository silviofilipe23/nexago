import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_share.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/profile_access.dart'
    show formatMissingProfileStepsForAccess;
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../data/tournament_partner_invite_service.dart';
import '../data/tournament_registration_service.dart';
import '../domain/category_age_eligibility.dart';
import '../domain/category_gender_eligibility.dart';
import '../domain/category_level_eligibility.dart';
import '../domain/registration_shell_logic.dart';
import '../domain/tournament_category_spots.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_invite_announcer.dart';
import '../domain/tournament_invite_links.dart';
import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_partner_invite_providers.dart';
import '../domain/tournament_registration_logic.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_team_roster_logic.dart';
import '../domain/uniform_auto_saver.dart';
import 'widgets/tournament_partner_invite_error_feedback.dart';
import 'widgets/tournament_registration/level_confirmation_sheet.dart';
import 'widgets/tournament_registration/registration_lgpd_consent_box.dart';
import 'widgets/tournament_registration/registration_shell_card.dart';
import 'widgets/tournament_registration/registration_shell_category_card.dart';
import 'widgets/tournament_registration/registration_shell_summary_card.dart';
import 'widgets/tournament_registration/tournament_registration_header.dart';
import 'widgets/tournament_registration/tournament_registration_partner_step.dart';
import 'widgets/tournament_registration/tournament_registration_roster_card.dart';
import 'widgets/tournament_registration/tournament_registration_sent_invites_list.dart';
import 'widgets/tournament_registration/tournament_registration_uniform_step.dart';

/// Tela de inscrição em torneio — **tela única**, espelhando o shell do portal
/// do atleta (`tournament-registration-shell.component`).
///
/// Os cartões seguem a ordem do portal: **1 Categoria**, **2 Uniforme** (quando
/// a categoria pede), **3 Sua inscrição** e o **Resumo** no fim. O pagamento
/// mora em [AppRoutes.tournamentRegistrationPayment], como na web.
///
/// A inscrição NÃO é estado local: ela é derivada da categoria selecionada
/// (`registrationsByCategoryId[categoria]`), do mesmo jeito que o portal deriva
/// de `myRegistrations`. Guardar o `registrationId` em `setState` era a origem
/// do beco sem saída da vaga solo pendente — quem entrava sem o id na rota caía
/// no passo de categoria e não achava mais o convite.
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

  /// Só `payment` ainda tem efeito: redireciona para a tela de pagamento.
  final TournamentRegistrationStep? initialStep;

  @override
  ConsumerState<TournamentRegistrationPage> createState() =>
      _TournamentRegistrationPageState();
}

class _TournamentRegistrationPageState
    extends ConsumerState<TournamentRegistrationPage> {
  String? _selectedCategoryId;
  bool _pickerOpen = false;

  /// Aceite do termo de imagem/LGPD marcado no checkbox desta tela.
  bool _lgpdAccepted = false;

  bool _registering = false;
  bool _acceptingInvite = false;
  bool _decliningInvite = false;
  bool _leavingTeam = false;
  bool _sharingExternalInvite = false;
  String? _invitingUserId;
  String? _cancelingInviteId;

  final _teamNameController = TextEditingController();

  TournamentUniformSelection _uniform = const TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    sizeShorts: 'M',
  );
  UniformSaveState _uniformSaveState = UniformSaveState.idle;
  String? _uniformError;
  late final UniformAutoSaver _uniformSaver = UniformAutoSaver(
    save: _writeUniform,
    onStateChange: (state) {
      if (mounted) setState(() => _uniformSaveState = state);
    },
  );

  /// Categoria cujos padrões de uniforme já foram aplicados.
  String? _uniformDefaultsCategoryId;

  /// Inscrição cujo uniforme gravado já foi trazido para a tela. Uma vez por
  /// inscrição: depois disso manda o que o atleta está editando, senão cada
  /// snapshot novo desfaria a escolha em andamento.
  String? _uniformHydratedRegistrationId;

  bool _appliedInitialCategory = false;
  bool _redirectedToPayment = false;
  bool _syncedJerseyNameFromProfile = false;

  @override
  void dispose() {
    _teamNameController.dispose();
    _uniformSaver.dispose();
    super.dispose();
  }

  // ── seleção de categoria ─────────────────────────────────────────────────

  /// Categoria da tela: a escolhida, ou a primeira da lista (igual ao portal,
  /// que cai em `cats[0]` quando nada foi escolhido).
  TournamentCategoryOffer? _resolveCategory(
    List<TournamentCategoryOffer> categories,
  ) {
    if (categories.isEmpty) return null;
    final id = _selectedCategoryId;
    if (id != null) {
      for (final c in categories) {
        if (c.id == id) return c;
      }
    }
    return categories.first;
  }

  /// Primeira categoria a abrir: a da rota, senão a que já tem inscrição
  /// (retomar vem antes de começar outra), senão a primeira inscritível.
  void _applyInitialCategory({
    required List<TournamentCategoryOffer> categories,
    required TournamentUserRegistrationsByCategory registrations,
    required Map<String, int> enrollment,
    required bool enrollmentResolved,
  }) {
    if (_appliedInitialCategory || categories.isEmpty) return;
    _appliedInitialCategory = true;

    final wanted = widget.initialCategoryId?.trim() ?? '';
    String? chosen;
    if (wanted.isNotEmpty && categories.any((c) => c.id == wanted)) {
      chosen = wanted;
    }

    // Inscrição indicada na rota: abre a categoria DELA.
    final regId = widget.initialRegistrationId?.trim() ?? '';
    if (chosen == null && regId.isNotEmpty) {
      for (final entry in registrations.entries) {
        if (entry.value.registrationId == regId) {
          chosen = entry.key;
          break;
        }
      }
    }

    // Sem pista na rota: retomar o que já começou vale mais que oferecer nova.
    chosen ??= categories
        .firstWhere(
          (c) => registrations.containsKey(c.id),
          orElse: () => categories.firstWhere(
            (c) => isCategorySelectable(
              c,
              inscriptionCount: enrollmentResolved
                  ? resolveInscriptionCountForOffer(
                      enrollment,
                      c,
                      countsResolved: enrollmentResolved,
                    )
                  : null,
            ),
            orElse: () => categories.first,
          ),
        )
        .id;

    if (chosen != _selectedCategoryId) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _selectedCategoryId = chosen);
      });
    }
  }

  void _selectCategory(TournamentCategoryOffer category) {
    setState(() {
      _selectedCategoryId = category.id;
      _pickerOpen = false;
      _uniformError = null;
      _teamNameController.clear();
    });
  }

  // ── uniforme ─────────────────────────────────────────────────────────────

  Future<void> _writeUniform(TournamentUniformSelection selection) async {
    final regId = _currentRegistrationId;
    if (regId == null || regId.isEmpty) {
      throw TournamentPartnerInviteException(
        'Sua inscrição ainda não foi criada.',
      );
    }
    await ref
        .read(tournamentPartnerInviteServiceProvider)
        .setRegistrationUniform(registrationId: regId, uniform: selection);
  }

  String? _currentRegistrationId;

  void _onUniformChanged(TournamentUniformSelection value) {
    setState(() => _uniform = value);
    final category = _resolvedCategoryForCallbacks;
    if (category == null) return;
    if ((_currentRegistrationId ?? '').isEmpty) return;
    if (validateUniformSelection(category: category, selection: value) != null) {
      // Meia escolha não vira gravação — e nem vira erro enquanto o atleta
      // ainda decide; o selo só volta para "Pendente".
      _uniformSaver.cancelPending();
      return;
    }
    setState(() => _uniformError = null);
    _uniformSaver.schedule(value);
  }

  TournamentCategoryOffer? _resolvedCategoryForCallbacks;

  /// Padrões do uniforme ao trocar de categoria, e o nome na camisa vindo do
  /// perfil quando ele chega depois.
  void _applyUniformDefaults(TournamentCategoryOffer category) {
    if (!categoryRequiresUniform(category)) return;
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final fullName = profile != null ? athleteDisplayName(profile) : '';
    final nickname = profile?.nickname;

    if (_uniformDefaultsCategoryId != category.id) {
      _uniformDefaultsCategoryId = category.id;
      _syncedJerseyNameFromProfile = false;
      _uniformHydratedRegistrationId = null;
      final defaults = defaultUniformSelectionForCategory(
        category,
        athleteName: fullName,
        athleteNickname: nickname,
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() {
          _uniform = defaults;
          _uniformSaver.reset();
        });
      });
      return;
    }

    if (!_syncedJerseyNameFromProfile &&
        category.uniformNameOnShirt &&
        (_uniform.jerseyName?.trim().isEmpty ?? true) &&
        fullName.isNotEmpty) {
      _syncedJerseyNameFromProfile = true;
      final filled = fillJerseyNameDefaultIfNeeded(
        category: category,
        selection: _uniform,
        athleteName: fullName,
        athleteNickname: nickname,
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _uniform = filled);
      });
    }
  }

  /// O que JÁ está gravado na inscrição manda na tela. Sem isso o cartão abria
  /// nos padrões (M/10) mesmo para quem escolheu outro tamanho pelo portal — e
  /// a gravação automática apagava a escolha real na primeira mexida.
  void _hydrateUniform(
    TournamentRegistrationSnapshot? snap,
    TournamentCategoryOffer? category,
  ) {
    if (snap == null || category == null) return;
    if (!categoryRequiresUniform(category)) return;
    if (_uniformHydratedRegistrationId == snap.registrationId) return;
    final uid = ref.read(authServiceProvider).currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    _uniformHydratedRegistrationId = snap.registrationId;
    final stored = snap.uniformFor(uid);
    final hydrated = hydrateUniformSelection(
      stored: stored,
      defaults: _uniform,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() => _uniform = hydrated);
      if (!stored.isEmpty) {
        _uniformSaver.markSaved(hydrated);
      } else if (validateUniformSelection(
            category: category,
            selection: hydrated,
          ) ==
          null) {
        // Inscrição sem uniforme nenhum (a vaga nasce sem): os padrões da tela
        // viram a escolha assim que o atleta abre — melhor um tamanho editável
        // no pedido do organizador do que uma linha em branco.
        _uniformSaver.saveNow(hydrated);
      }
    });
  }

  // ── gates ────────────────────────────────────────────────────────────────

  void _showProfileAccessBlocked() {
    final access = ref.read(tournamentAccessStateProvider);
    final message = access.snackbarMessage;
    if (message != null && mounted) {
      showAppSnackBar(context, message, isError: true);
    }
  }

  bool _requireLgpd(String action) {
    if (_lgpdAccepted) return true;
    showAppSnackBar(
      context,
      'Marque o aceite do termo de uso de imagem e LGPD para $action.',
      isError: true,
    );
    return false;
  }

  /// Última chance de revisar o nível antes de travar o ratchet "nível só
  /// sobe": só aparece na PRIMEIRA inscrição do atleta naquele esporte.
  ///
  /// Usa `athleteProfileProvider.future` (não `.valueOrNull`): perfil ainda
  /// carregando lido como "sem perfil" pularia o gate em silêncio, bem na
  /// janela que precisa dele. Erro bloqueia a submissão — nunca decide no
  /// escuro.
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

  // ── ações ────────────────────────────────────────────────────────────────

  Future<void> _registerSolo(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
  ) async {
    if (_registering) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    if (!_requireLgpd('reservar sua vaga')) return;
    if (!await _ensureLevelConfirmed(tournament.sport)) return;

    setState(() => _registering = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .registerSolo(
            tournamentId: tournament.id,
            categoryId: category.id,
            // A vaga nasce sem uniforme; a escolha é gravada logo em seguida
            // pelo auto-save (mesmo par de chamadas que o portal faz).
            uniform: null,
            lgpdAccepted: true,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Vaga reservada! Falta formar a dupla — convide seu parceiro.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível reservar a vaga. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  Future<void> _createTeam(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
  ) async {
    if (_registering) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    final teamName = _teamNameController.text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (teamName.length < 3 || teamName.length > 30) {
      showAppSnackBar(
        context,
        'Dê um nome de 3 a 30 caracteres para criar a equipe.',
        isError: true,
      );
      return;
    }
    if (!_requireLgpd('criar a equipe')) return;
    if (!await _ensureLevelConfirmed(tournament.sport)) return;

    setState(() => _registering = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .createTeamRegistration(
            tournamentId: tournament.id,
            categoryId: category.id,
            teamName: teamName,
            uniform: null,
            lgpdAccepted: true,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        '$teamName está com a vaga reservada — convide os atletas para '
        'completar o elenco.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível criar a equipe. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  /// Convite direto da linha do atleta (como no portal): não há passo
  /// intermediário de "selecionar parceiro".
  Future<void> _invitePartner({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
    required TournamentRegistrationPartnerCandidate candidate,
  }) async {
    if (_invitingUserId != null) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }

    // O convite só sai com o uniforme do titular completo — ele viaja junto
    // (`inviterUniform`) para o convidado ver a dupla montada.
    if (categoryRequiresUniform(category)) {
      final error = validateUniformSelection(
        category: category,
        selection: _uniform,
      );
      if (error != null) {
        setState(() => _uniformError = error);
        return;
      }
    }

    final profile = ref.read(athleteProfileProvider).valueOrNull;
    final inviterName = profile != null
        ? athleteDisplayName(profile, fallback: 'Atleta')
        : 'Atleta';

    setState(() => _invitingUserId = candidate.userId);
    try {
      final result = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .sendInvite(
            tournamentId: tournament.id,
            categoryId: category.id,
            inviteeUid: candidate.userId,
            inviteeName: candidate.name,
            inviterName: inviterName,
            inviterUniform: uniformPayloadForPartnerInvite(
              category: category,
              selection: _uniform,
            ),
            lgpdAccepted: true,
          );
      if (!mounted) return;
      final firstName = candidate.name.split(' ').first;
      // Parceiro com cadastro incompleto não consegue aceitar: sem este aviso
      // o convite ficava "aguardando" até expirar sem ninguém saber o motivo.
      final missing = formatMissingProfileStepsForAccess(
        result.inviteeMissingSteps,
      );
      showAppSnackBar(
        context,
        result.inviteeProfileReady
            ? 'Convite enviado para $firstName.'
            : 'Convite enviado! Avise $firstName: falta completar '
                  '${missing.isEmpty ? 'o cadastro' : missing} no perfil para '
                  'poder aceitar.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } finally {
      if (mounted) setState(() => _invitingUserId = null);
    }
  }

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

  /// Aceite do convite recebido **aqui mesmo** — o portal já fazia assim, e no
  /// app dependia de o atleta achar a tela do convite pela notificação.
  Future<void> _acceptReceivedInvite({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
    required TournamentPartnerInvite invite,
  }) async {
    if (_acceptingInvite || _decliningInvite) return;
    if (!ref.read(tournamentAccessStateProvider).canAccess) {
      _showProfileAccessBlocked();
      return;
    }
    if (!_requireLgpd('formar a dupla')) return;

    TournamentUniformSelection? inviteeUniform;
    if (categoryRequiresUniform(category)) {
      final error = validateUniformSelection(
        category: category,
        selection: _uniform,
      );
      if (error != null) {
        setState(() => _uniformError = error);
        return;
      }
      inviteeUniform = _uniform;
    }
    if (!await _ensureLevelConfirmed(tournament.sport)) return;

    setState(() => _acceptingInvite = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .acceptInvite(
            invite.id,
            inviteeUniform: inviteeUniform,
            lgpdAccepted: true,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        invite.isTeamInvite
            ? 'Você entrou na equipe ${invite.teamName ?? invite.inviterName}. '
                  'Falta o pagamento.'
            : 'Dupla formada com ${invite.inviterName.split(' ').first}. '
                  'Falta o pagamento.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } finally {
      if (mounted) setState(() => _acceptingInvite = false);
    }
  }

  Future<void> _declineReceivedInvite(TournamentPartnerInvite invite) async {
    if (_acceptingInvite || _decliningInvite) return;
    setState(() => _decliningInvite = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelInvite(invite.id, asDecline: true);
      if (!mounted) return;
      showAppSnackBar(
        context,
        '${invite.inviterName.split(' ').first} foi avisado e pode convidar '
        'outra pessoa.',
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _decliningInvite = false);
    }
  }

  /// Convite por LINK para quem ainda não tem conta: o backend cria um token de
  /// uso único e o convite nasce sozinho quando o parceiro termina o cadastro.
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
      final profile = ref.read(athleteProfileProvider).valueOrNull;
      final inviterName = profile != null
          ? athleteDisplayName(profile, fallback: 'Atleta')
          : 'Atleta';
      final externalInviteId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .createExternalInvite(
            tournamentId: tournament.id,
            categoryId: category.id,
          );
      if (!mounted) return;
      final url = externalPartnerInviteUrl(
        externalInviteId: externalInviteId,
        referralCode: ref.read(authServiceProvider).currentUser?.uid,
        inviterName: inviterName,
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
          teamName: category.isTeamCategory ? _teamNameForShare() : null,
        ),
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _sharingExternalInvite = false);
    }
  }

  /// Nome da equipe da inscrição atual, para o texto do convite por link.
  String? _teamNameForShare() {
    final regId = _currentRegistrationId;
    if (regId == null || regId.isEmpty) return null;
    return ref
        .read(tournamentRegistrationSnapshotProvider(regId))
        .valueOrNull
        ?.teamName;
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
      showAppSnackBar(context, 'Você saiu da equipe.');
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _leavingTeam = false);
    }
  }

  void _goToPayment({
    required String registrationId,
    required String categoryId,
    bool replace = false,
  }) {
    final params = <String, String>{'tournamentId': widget.tournamentId};
    final query = <String, String>{
      'registrationId': registrationId,
      'categoryId': categoryId,
    };
    if (replace) {
      context.pushReplacementNamed(
        AppRouteNames.tournamentRegistrationPayment,
        pathParameters: params,
        queryParameters: query,
      );
      return;
    }
    context.pushNamed(
      AppRouteNames.tournamentRegistrationPayment,
      pathParameters: params,
      queryParameters: query,
    );
  }

  void _exit() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.goNamed(
        AppRouteNames.tournamentDetail,
        pathParameters: <String, String>{'tournamentId': widget.tournamentId},
      );
    }
  }

  // ── build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final access = ref.watch(tournamentAccessStateProvider);

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
            onAction: _exit,
          ),
          data: (value) {
            final tournament = value!;
            final categories = tournament.categoryOffers;
            if (categories.isEmpty) {
              return AppEmptyView(
                icon: Icons.category_outlined,
                title: 'Nenhuma categoria disponível',
                subtitle: 'Este torneio ainda não abriu categorias.',
                actionLabel: 'Voltar',
                onAction: _exit,
              );
            }

            final registrations =
                ref
                    .watch(
                      tournamentUserRegistrationsByCategoryProvider(
                        widget.tournamentId,
                      ),
                    )
                    .valueOrNull ??
                const <String, UserCategoryRegistration>{};
            final enrollmentAsync = ref.watch(
              tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
            );
            final enrollmentResolved = enrollmentAsync.hasValue;
            final enrollment =
                enrollmentAsync.valueOrNull ?? const <String, int>{};

            _applyInitialCategory(
              categories: categories,
              registrations: registrations,
              enrollment: enrollment,
              enrollmentResolved: enrollmentResolved,
            );

            final category = _resolveCategory(categories);
            _resolvedCategoryForCallbacks = category;
            if (category != null) _applyUniformDefaults(category);

            final registration = category != null
                ? registrations[category.id]
                : null;
            _currentRegistrationId = registration?.registrationId;

            final snap = registration != null
                ? ref
                      .watch(
                        tournamentRegistrationSnapshotProvider(
                          registration.registrationId,
                        ),
                      )
                      .valueOrNull
                : null;
            _hydrateUniform(snap, category);

            // Rota antiga com `?step=payment`: o pagamento agora é outra tela.
            if (widget.initialStep == TournamentRegistrationStep.payment &&
                !_redirectedToPayment &&
                registration != null &&
                category != null) {
              _redirectedToPayment = true;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted) return;
                _goToPayment(
                  registrationId: registration.registrationId,
                  categoryId: category.id,
                  replace: true,
                );
              });
            }

            return Column(
              children: [
                TournamentRegistrationHeader(
                  onBack: _exit,
                  title: 'Inscrever-se',
                  tournamentName: tournament.name,
                  tournamentDateLabel: tournament.dateLabel,
                  categoryLabel: category?.name,
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
                      if (!access.canAccess) ...[
                        TournamentAccessBanner(
                          onboardingCompleted: access.onboardingCompleted,
                          blockMessage: access.blockMessage,
                          missingStepTitles: access.missingStepTitles,
                        ),
                        const SizedBox(height: AppSpacing.lg),
                      ],
                      ..._buildCards(
                        tournament: tournament,
                        categories: categories,
                        category: category,
                        registrations: registrations,
                        registration: registration,
                        snap: snap,
                        enrollment: enrollment,
                        enrollmentResolved: enrollmentResolved,
                        canAccess: access.canAccess,
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  RegistrationCategoryStatus _statusOf({
    required TournamentCategoryOffer offer,
    required TournamentDetail tournament,
    required TournamentUserRegistrationsByCategory registrations,
    required Map<String, int> enrollment,
    required bool enrollmentResolved,
  }) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final levelRank = CategoryLevelEligibility.athleteLevelRank(
      profile,
      tournamentSport: tournament.sport,
    );
    final inscriptionCount = resolveInscriptionCountForOffer(
      enrollment,
      offer,
      countsResolved: enrollmentResolved,
    );
    final capacity = categoryMaxTeams(offer);
    return registrationCategoryStatus(
      offer: offer,
      alreadyRegistered: registrations.containsKey(offer.id),
      spotsLeft: capacity > 0
          ? categorySpotsLeft(offer, inscriptionCount: inscriptionCount)
          : null,
      eligibility: RegistrationEligibilityInput(
        levelBlocked: !CategoryLevelEligibility.isCategoryEligibleForLevel(
          offer,
          levelRank,
        ),
        belowMinLevel:
            CategoryLevelEligibility.categoryLevelRank(offer) >= levelRank &&
            levelRank < CategoryLevelEligibility.categoryMinLevelRank(offer),
        ageEligibility: CategoryAgeEligibility.evaluate(
          offer,
          profile,
          tournamentStart: tournament.startDate,
        ),
        genderBlocked:
            !CategoryGenderEligibility.isCategoryEligibleForAthlete(
              offer,
              profile,
            ),
      ),
    );
  }

  List<Widget> _buildCards({
    required TournamentDetail tournament,
    required List<TournamentCategoryOffer> categories,
    required TournamentCategoryOffer? category,
    required TournamentUserRegistrationsByCategory registrations,
    required UserCategoryRegistration? registration,
    required TournamentRegistrationSnapshot? snap,
    required Map<String, int> enrollment,
    required bool enrollmentResolved,
    required bool canAccess,
  }) {
    final selectedStatus = category != null
        ? _statusOf(
            offer: category,
            tournament: tournament,
            registrations: registrations,
            enrollment: enrollment,
            enrollmentResolved: enrollmentResolved,
          )
        : null;
    final others = categories
        .where((c) => c.id != category?.id)
        .map(
          (c) => (
            offer: c,
            status: _statusOf(
              offer: c,
              tournament: tournament,
              registrations: registrations,
              enrollment: enrollment,
              enrollmentResolved: enrollmentResolved,
            ),
          ),
        )
        .toList();

    final uniformRequired =
        category != null && categoryRequiresUniform(category);
    final receivedInvite = receivedInviteForCategory(
      pending:
          ref.watch(pendingTournamentPartnerInvitesProvider).valueOrNull ??
          const <TournamentPartnerInvite>[],
      tournamentId: widget.tournamentId,
      categoryId: category?.id ?? '',
    );
    final hasRegistration = registration != null;
    final cardState = registrationCardState(
      hasReceivedInvite: receivedInvite != null,
      hasRegistration: hasRegistration,
      partnerPending: registration?.partnerPending ?? false,
      isPaid: registration?.isPaid ?? false,
    );

    return [
      RegistrationShellCategoryCard(
        selected: category,
        selectedStatus: selectedStatus,
        others: others,
        pickerOpen: _pickerOpen,
        onTogglePicker: () => setState(() => _pickerOpen = !_pickerOpen),
        onSelect: _selectCategory,
        hasRegistration: hasRegistration,
      ),
      // Convite recebido: o uniforme aparece dentro do cartão do aceite (é lá
      // que ele viaja), então o cartão próprio sai — igual ao portal.
      if (uniformRequired &&
          receivedInvite == null &&
          category != null) ...[
        const SizedBox(height: AppSpacing.lg),
        RegistrationShellCard(
          step: 2,
          title: 'Uniforme',
          trailing: hasRegistration
              ? _UniformStatusChip(state: _uniformSaveState)
              : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_uniformError != null) ...[
                RegistrationShellNote(_uniformError!, tone: AppColors.live),
                const SizedBox(height: AppSpacing.md),
              ],
              if (_uniformSaveState == UniformSaveState.failed) ...[
                Row(
                  children: [
                    Expanded(
                      child: RegistrationShellNote(
                        'Não foi possível salvar sua escolha.',
                        tone: AppColors.live,
                      ),
                    ),
                    TextButton(
                      onPressed: _uniformSaver.retry,
                      child: const Text('Tentar de novo'),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              TournamentRegistrationUniformStep(
                compact: true,
                tournament: tournament,
                category: category,
                selection: _uniform,
                onChanged: _onUniformChanged,
              ),
              const SizedBox(height: AppSpacing.md),
              RegistrationShellNote(
                hasRegistration
                    ? 'Sua escolha é salva sozinha — não precisa confirmar.'
                    : 'Seu uniforme é enviado junto com a reserva da vaga.',
              ),
            ],
          ),
        ),
      ],
      const SizedBox(height: AppSpacing.lg),
      RegistrationShellCard(
        step: registrationCardStepNumber(uniformRequired: uniformRequired),
        title: 'Sua inscrição',
        child: category == null
            ? const RegistrationShellNote('Escolha uma categoria acima.')
            : _buildRegistrationCardBody(
                tournament: tournament,
                category: category,
                state: cardState,
                receivedInvite: receivedInvite,
                registration: registration,
                snap: snap,
                canAccess: canAccess,
              ),
      ),
      const SizedBox(height: AppSpacing.lg),
      if (category != null)
        RegistrationShellSummaryCard(
          tournamentName: tournament.name,
          locationLine: [
            tournament.location,
            tournament.city,
          ].where((s) => s.trim().isNotEmpty).join(' · '),
          dateLabel: tournament.dateLabel.isNotEmpty
              ? tournament.dateLabel
              : 'Data a confirmar',
          categoryName: category.name,
          teamName: snap?.teamName,
          statusLabel: registrationSummaryStatusLabel(
            hasRegistration: hasRegistration,
            partnerPending: registration?.partnerPending ?? false,
            isPaid: registration?.isPaid ?? false,
            isTeamCategory: category.isTeamCategory,
            rosterCount: snap?.participantUids.length ?? 0,
            teamSize: category.rosterSize,
            sentInviteCount: _sentInvitesFor(category).length,
          ),
          uniformLabel: uniformRequired
              ? (_uniformSaveState == UniformSaveState.saved
                    ? 'Salvo'
                    : validateUniformSelection(
                            category: category,
                            selection: _uniform,
                          ) ==
                          null
                    ? 'Completo'
                    : 'Pendente')
              : null,
          lgpdLabel: hasRegistration ? 'Aceito' : null,
          priceLabel: formatRegistrationMoney(category.entryFee),
          priceUnitLabel: category.unitSingular,
        ),
    ];
  }

  List<TournamentPartnerInvite> _sentInvitesFor(
    TournamentCategoryOffer category,
  ) {
    return sentPendingInvitesFor(
      invites:
          ref.watch(inviterTournamentPartnerInvitesProvider).valueOrNull ??
          const <TournamentPartnerInvite>[],
      tournamentId: widget.tournamentId,
      categoryId: category.id,
    );
  }

  Widget _buildRegistrationCardBody({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
    required RegistrationCardState state,
    required TournamentPartnerInvite? receivedInvite,
    required UserCategoryRegistration? registration,
    required TournamentRegistrationSnapshot? snap,
    required bool canAccess,
  }) {
    switch (state) {
      case RegistrationCardState.receivedInvite:
        final invite = receivedInvite!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            RegistrationShellNote(
              invite.isTeamInvite && invite.teamName != null
                  ? 'Convite de ${invite.inviterName} para entrar na equipe '
                        '${invite.teamName} nesta categoria.'
                  : 'Convite de ${invite.inviterName} para jogar nesta '
                        'categoria.',
            ),
            if (categoryRequiresUniform(category)) ...[
              const SizedBox(height: AppSpacing.lg),
              TournamentRegistrationUniformStep(
                compact: true,
                tournament: tournament,
                category: category,
                selection: _uniform,
                onChanged: (v) => setState(() {
                  _uniform = v;
                  _uniformError = null;
                }),
              ),
              if (_uniformError != null) ...[
                const SizedBox(height: AppSpacing.sm),
                RegistrationShellNote(_uniformError!, tone: AppColors.live),
              ],
            ],
            const SizedBox(height: AppSpacing.lg),
            RegistrationLgpdConsentBox(
              accepted: _lgpdAccepted,
              enabled: !_acceptingInvite && !_decliningInvite,
              onChanged: (v) => setState(() => _lgpdAccepted = v),
            ),
            const SizedBox(height: AppSpacing.md),
            FilledButton(
              onPressed:
                  (_acceptingInvite || _decliningInvite || !canAccess)
                  ? null
                  : () => _acceptReceivedInvite(
                      tournament: tournament,
                      category: category,
                      invite: invite,
                    ),
              child: Text(_acceptingInvite ? 'Aceitando…' : 'Aceitar convite'),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              onPressed: (_acceptingInvite || _decliningInvite)
                  ? null
                  : () => _declineReceivedInvite(invite),
              child: Text(_decliningInvite ? 'Recusando…' : 'Recusar'),
            ),
          ],
        );

      case RegistrationCardState.notRegistered:
        final status = _statusOfSelected(tournament, category);
        final blocked = status?.blocked ?? false;
        if (category.isTeamCategory) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RegistrationShellNote(
                'Categoria de ${category.formatLabel.toLowerCase()}: você cria '
                'a equipe com um nome e convida os atletas depois.',
              ),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: _teamNameController,
                textCapitalization: TextCapitalization.words,
                maxLength: 40,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Nome da equipe',
                  hintText: 'Ex.: ${category.formatLabel} Calango',
                  counterText: '',
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              RegistrationLgpdConsentBox(
                accepted: _lgpdAccepted,
                enabled: !_registering,
                onChanged: (v) => setState(() => _lgpdAccepted = v),
              ),
              const SizedBox(height: AppSpacing.md),
              FilledButton(
                onPressed: (_registering || blocked || !canAccess)
                    ? null
                    : () => _createTeam(tournament, category),
                child: Text(_registering ? 'Criando…' : 'Criar equipe'),
              ),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const RegistrationShellNote(
              'Você ainda não se inscreveu nesta categoria — a vaga é reservada '
              'assim que você confirma, e você convida seu parceiro depois.',
            ),
            const SizedBox(height: AppSpacing.lg),
            RegistrationLgpdConsentBox(
              accepted: _lgpdAccepted,
              enabled: !_registering,
              onChanged: (v) => setState(() => _lgpdAccepted = v),
            ),
            const SizedBox(height: AppSpacing.md),
            FilledButton(
              onPressed: (_registering || blocked || !canAccess)
                  ? null
                  : () => _registerSolo(tournament, category),
              child: Text(
                _registering ? 'Inscrevendo…' : 'Reservar minha vaga',
              ),
            ),
          ],
        );

      case RegistrationCardState.awaitingRoster:
        return _buildRosterBody(
          tournament: tournament,
          category: category,
          snap: snap,
          canAccess: canAccess,
        );

      case RegistrationCardState.awaitingPayment:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            RegistrationShellNote(
              category.isTeamCategory
                  ? 'Equipe completa! Falta só o pagamento para confirmar a '
                        'vaga.'
                  : 'Dupla completa! Falta só o pagamento para confirmar a '
                        'vaga.',
            ),
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              onPressed: () => _goToPayment(
                registrationId: registration!.registrationId,
                categoryId: category.id,
              ),
              child: const Text('Ir para pagamento'),
            ),
          ],
        );

      case RegistrationCardState.confirmed:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const RegistrationShellNote(
              'Inscrição confirmada e paga — nos vemos na quadra! 🏐',
            ),
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              onPressed: () => _goToPayment(
                registrationId: registration!.registrationId,
                categoryId: category.id,
              ),
              child: const Text('Ver minha inscrição'),
            ),
          ],
        );
    }
  }

  RegistrationCategoryStatus? _statusOfSelected(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
  ) {
    final registrations =
        ref
            .watch(
              tournamentUserRegistrationsByCategoryProvider(
                widget.tournamentId,
              ),
            )
            .valueOrNull ??
        const <String, UserCategoryRegistration>{};
    final enrollmentAsync = ref.watch(
      tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
    );
    return _statusOf(
      offer: category,
      tournament: tournament,
      registrations: registrations,
      enrollment: enrollmentAsync.valueOrNull ?? const <String, int>{},
      enrollmentResolved: enrollmentAsync.hasValue,
    );
  }

  /// Elenco incompleto: convites enviados, busca de parceiro e convite por
  /// link — na mesma ordem do portal.
  Widget _buildRosterBody({
    required TournamentDetail tournament,
    required TournamentCategoryOffer category,
    required TournamentRegistrationSnapshot? snap,
    required bool canAccess,
  }) {
    final myUid = ref.watch(authServiceProvider).currentUser?.uid;
    final sentInvites = _sentInvitesFor(category);
    final rosterCount = snap?.participantUids.length ?? 1;
    final isCaptain =
        snap == null ||
        (snap.captainUid ?? snap.player1Id) == myUid ||
        !category.isTeamCategory;
    final remainingSlots = registrationRemainingInviteSlots(
      teamSize: category.isTeamCategory ? category.rosterSize : null,
      rosterCount: rosterCount,
      pendingInviteCount: sentInvites.length,
    );

    final profiles =
        ref
            .watch(
              registrationRosterProfilesProvider(
                snap?.participantUids ?? const <String>[],
              ),
            )
            .valueOrNull ??
        const <String, AppUserProfile>{};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegistrationShellNote(
          category.isTeamCategory
              ? 'Elenco $rosterCount/${category.rosterSize}. '
                    '${isCaptain ? 'Convide os atletas que faltam.' : 'O capitão está montando o elenco.'}'
              : 'Vaga reservada! Agora busque e convide seu parceiro de dupla.',
        ),
        if (category.isTeamCategory && snap != null) ...[
          const SizedBox(height: AppSpacing.lg),
          TournamentRegistrationRosterCard(
            teamName: snap.teamName,
            members: buildTeamRoster(
              participantUids: snap.participantUids,
              captainUid: snap.captainUid,
              myUid: myUid,
              nameByUid: {
                for (final e in profiles.entries)
                  e.key: appUserDisplayName(e.value),
              },
              photoByUid: {
                for (final e in profiles.entries)
                  if (e.value.profilePhotoUrl?.isNotEmpty ?? false)
                    e.key: e.value.profilePhotoUrl!,
              },
            ),
            remainingSlots: remainingSlots,
            leaving: _leavingTeam,
            onLeaveTeam:
                canLeaveTeamRegistration(
                  teamSize: snap.teamSize,
                  captainUid: snap.captainUid ?? snap.player1Id,
                  myUid: myUid,
                  isPaid: snap.isPaid,
                  sharePaidUids: snap.sharePaidUids,
                )
                ? () => _leaveTeam(snap)
                : null,
          ),
        ],
        if (isCaptain) ...[
          if (remainingSlots == 0 && sentInvites.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            const RegistrationShellNote(
              'Todas as vagas estão reservadas por convites pendentes. Cancele '
              'um convite para chamar outro atleta.',
            ),
          ],
          if (sentInvites.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            TournamentRegistrationSentInvitesList(
              invites: sentInvites,
              cancelingInviteId: _cancelingInviteId,
              onCancel: _cancelSentInvite,
            ),
          ],
          if (remainingSlots > 0) ...[
            const SizedBox(height: AppSpacing.lg),
            TournamentRegistrationPartnerStep(
              compact: true,
              category: category,
              selectedUserId: null,
              invitingUserId: _invitingUserId,
              excludeUserIds: {
                ...?snap?.participantUids,
                ...sentInvites.map((i) => i.inviteeUid),
              },
              onSelected: (candidate) {
                if (!canAccess) {
                  _showProfileAccessBlocked();
                  return;
                }
                _invitePartner(
                  tournament: tournament,
                  category: category,
                  candidate: candidate,
                );
              },
              onInviteByLink: _sharingExternalInvite
                  ? () {}
                  : () => _shareExternalInvite(tournament, category),
            ),
          ],
        ],
      ],
    );
  }
}

/// Selo do estado da gravação automática, no cabeçalho do cartão de uniforme.
class _UniformStatusChip extends StatelessWidget {
  const _UniformStatusChip({required this.state});

  final UniformSaveState state;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (state) {
      UniformSaveState.saving => ('Salvando…', RegistrationPillTone.neutral),
      UniformSaveState.saved => ('Salvo', RegistrationPillTone.brand),
      UniformSaveState.failed => ('Falhou', RegistrationPillTone.warn),
      UniformSaveState.idle => ('Pendente', RegistrationPillTone.neutral),
    };
    return RegistrationShellPill(label: label, tone: tone);
  }
}
