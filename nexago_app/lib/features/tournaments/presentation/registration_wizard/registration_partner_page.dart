import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../athlete/domain/profile_access.dart'
    show formatMissingProfileStepsForAccess;
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../../data/tournament_partner_invite_service.dart';
import '../../data/tournament_registration_service.dart';
import '../../domain/registration_shell_logic.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_invite_links.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../../domain/tournament_registration_providers.dart';
import '../../domain/tournament_team_roster_logic.dart';
import '../widgets/registration_wizard/registration_wizard_notice.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/tournament_partner_invite_error_feedback.dart';
import '../widgets/tournament_registration/tournament_registration_partner_step.dart';
import '../widgets/tournament_registration/tournament_registration_roster_card.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';

/// Passo 4 do wizard: parceiro (dupla) ou elenco (equipe trio+).
///
/// Casca nova em volta do [TournamentRegistrationPartnerStep], que JÁ existe
/// e já foi otimizado numa task anterior (busca com mínimo de 3 letras, teto
/// de 10, zero leitura ao abrir, filtro de gênero, convite por link, cartão
/// de vaga solo) — **não reescrito aqui**.
///
/// Três variantes:
/// - **Dupla**: só o passo de busca. Convite via `sendInvite`, ou reserva
///   solo via `registerSolo` quando o torneio permite (`!requireFormedPair`).
///   `sendInvite` aqui quase sempre nasce "no vácuo": sem uma reserva prévia
///   (`widget.registrationId` vazio — o caminho normal ao chegar da tela de
///   condições), o backend só CRIA a inscrição quando o convidado aceita
///   (`sendPartnerInviteFor`, modo "create" — ver
///   `functions/src/tournament-partner-invite.ts`). Por isso o sucesso sem
///   `registrationId` conhecido volta para a tela guarda-chuva
///   ([AppRouteNames.tournamentRegistration]), que resolve sozinha o que
///   mostrar quando a inscrição nascer, em vez de inventar um id.
/// - **Equipe sem inscrição** (`registrationId` vazio): campo de nome +
///   CTA que chama `createTeamRegistration` — só ela cria a equipe NOMEADA
///   que os convites (`sendInvite`) exigem para existir. É o vão que o
///   protótipo (só desenhou dupla) e o plano não cobriam: `sendInvite`
///   convida para uma equipe que já existe, não cria uma.
/// - **Equipe com inscrição** (`registrationId` presente):
///   [TournamentRegistrationRosterCard] acima do passo, com o elenco atual —
///   o convite anexa à inscrição do capitão (modo "attach" no backend), e o
///   `registrationId` já conhecido segue direto para o próximo passo.
///
/// Em QUALQUER variante, o aceite LGPD chegou pela URL (`?lgpd=1`, desde a
/// tela de condições) e é carimbado como `lgpdAccepted` na callable que a
/// tela dispara — não há checkbox aqui.
class RegistrationPartnerPage extends ConsumerStatefulWidget {
  const RegistrationPartnerPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.registrationId,
    this.lgpdAccepted = false,
  });

  final String tournamentId;
  final String categoryId;
  final String? registrationId;
  final bool lgpdAccepted;

  @override
  ConsumerState<RegistrationPartnerPage> createState() =>
      _RegistrationPartnerPageState();
}

class _RegistrationPartnerPageState
    extends ConsumerState<RegistrationPartnerPage> {
  TournamentRegistrationPartnerCandidate? _selected;
  bool _submitting = false;

  final _teamNameController = TextEditingController();

  @override
  void dispose() {
    _teamNameController.dispose();
    super.dispose();
  }

  void _exit() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.tournamentId},
    );
  }

  /// Sucesso de qualquer uma das três callables.
  ///
  /// Com `registrationId` conhecido, segue para uniforme/pagamento — a mesma
  /// regra em todas as variantes. Sem ele (convite de dupla "no vácuo", ver
  /// doc da classe), volta para a tela guarda-chuva: não há o que configurar
  /// enquanto a inscrição não existir de verdade.
  void _advanceAfterSuccess(
    TournamentCategoryOffer category,
    String? registrationId,
  ) {
    if (!mounted) return;
    final regId = registrationId?.trim() ?? '';
    if (regId.isEmpty) {
      context.pushNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {
          'categoryId': widget.categoryId,
          // O aceite tem de ATRAVESSAR: sem inscrição criada (convite de dupla
          // "no vácuo") ele só existe como parâmetro de rota. O porteiro manda
          // de volta para cá pelo ramo `hasSentInvitePending`, e sem `lgpd`
          // aqui a volta chegaria com `lgpdAccepted: false` — as callables
          // continuariam disponíveis e criariam a inscrição SEM o aceite, que
          // a CF simplesmente não grava (sem erro e sem log).
          if (widget.lgpdAccepted) 'lgpd': '1',
        },
      );
      return;
    }
    final next = categoryRequiresUniform(category)
        ? AppRouteNames.tournamentRegistrationUniform
        : AppRouteNames.tournamentRegistrationPayment;
    context.pushNamed(
      next,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        'registrationId': regId,
      },
    );
  }

  // ── ações ────────────────────────────────────────────────────────────────

  /// Cinto e suspensório do aceite LGPD.
  ///
  /// As três ações desta tela CRIAM inscrição (o convite de dupla cria no
  /// aceite do convidado). A callable só carimba `lgpdAcceptedUids` quando o
  /// flag chega `true` — em silêncio, sem erro, quando chega `false`. E não há
  /// segunda chance: daí em diante o porteiro trata inscrição existente como
  /// consentida. Então, sem aceite e sem inscrição, o caminho é o passo do
  /// consentimento, não a callable.
  ///
  /// Com inscrição já existente o aceite ou já foi carimbado ou é assunto de
  /// outra tela — aqui não se recolhe de novo.
  bool _consentMissing() {
    if (widget.lgpdAccepted) return false;
    if ((widget.registrationId?.trim() ?? '').isNotEmpty) return false;
    context.pushReplacementNamed(
      AppRouteNames.tournamentRegistrationConsent,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {'categoryId': widget.categoryId},
    );
    return true;
  }

  Future<void> _sendInvite(TournamentCategoryOffer category) async {
    final candidate = _selected;
    if (candidate == null || _submitting) return;
    if (_consentMissing()) return;
    setState(() => _submitting = true);
    try {
      final profile = ref.read(athleteProfileProvider).valueOrNull;
      final inviterName = profile != null
          ? athleteDisplayName(profile, fallback: 'Atleta')
          : 'Atleta';
      final result = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .sendInvite(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            inviteeUid: candidate.userId,
            inviteeName: candidate.name,
            inviterName: inviterName,
            lgpdAccepted: widget.lgpdAccepted,
          );
      if (!mounted) return;
      final firstName = _firstNameOf(candidate.name);
      // Parceiro com cadastro incompleto não consegue aceitar: sem este
      // aviso o convite ficava "aguardando" até expirar sem ninguém saber o
      // motivo — mesma ramificação da tela única (`inviteeProfileReady` /
      // `inviteeMissingSteps`, já devolvidos por `sendInvite`).
      final missing = formatMissingProfileStepsForAccess(
        result.inviteeMissingSteps,
      );
      showAppSnackBar(
        context,
        result.inviteeProfileReady
            ? 'Convite enviado para $firstName.'
            : 'Convite enviado! Avise $firstName: falta completar '
                  '${missing.isEmpty ? 'o cadastro' : missing} no perfil '
                  'para poder aceitar.',
      );
      _advanceAfterSuccess(category, widget.registrationId);
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

  Future<void> _registerSolo(TournamentCategoryOffer category) async {
    if (_submitting) return;
    if (_consentMissing()) return;
    setState(() => _submitting = true);
    try {
      final registrationId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .registerSolo(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            lgpdAccepted: widget.lgpdAccepted,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Vaga reservada! Falta formar a dupla — convide seu parceiro.',
      );
      _advanceAfterSuccess(category, registrationId);
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
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _createTeam(TournamentCategoryOffer category) async {
    if (_submitting) return;
    if (_consentMissing()) return;
    final teamName = _teamNameController.text
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (teamName.length < 3 || teamName.length > 30) {
      showAppSnackBar(
        context,
        'Dê um nome de 3 a 30 caracteres para criar a equipe.',
        isError: true,
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final result = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .createTeamRegistration(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
            teamName: teamName,
            lgpdAccepted: widget.lgpdAccepted,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        '$teamName está com a vaga reservada — convide os atletas para '
        'completar o elenco.',
      );
      _advanceAfterSuccess(category, result.registrationId);
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
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Convite por link (parceiro sem conta ainda) — mesmo par de chamadas da
  /// tela única (`createExternalInvite` + `nexaShareText`).
  Future<void> _shareByLink(
    TournamentDetail tournament,
    TournamentCategoryOffer category, {
    String? teamName,
  }) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final profile = ref.read(athleteProfileProvider).valueOrNull;
      final inviterName = profile != null
          ? athleteDisplayName(profile, fallback: 'Atleta')
          : 'Atleta';
      final externalInviteId = await ref
          .read(tournamentPartnerInviteServiceProvider)
          .createExternalInvite(
            tournamentId: widget.tournamentId,
            categoryId: widget.categoryId,
          );
      if (!mounted) return;
      final url = externalPartnerInviteUrl(
        externalInviteId: externalInviteId,
        referralCode: profile?.id,
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
          teamName: teamName,
        ),
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      await showTournamentPartnerInviteError(context, e);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível gerar o link do convite.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );

    // Mesma guarda das telas irmãs: SÓ `hasError`, sem `&& !hasValue` — erro
    // numa assinatura já estabelecida preserva o valor anterior no mesmo
    // `AsyncValue` (`AsyncError.copyWithPrevious`), e o `.when()` do
    // `NexaAsyncView` cai no ramo de erro mesmo assim.
    if (tournamentAsync.hasError) {
      return _wizardChrome(
        context,
        AppErrorView(
          title: 'Não foi possível carregar',
          message: 'Não foi possível carregar o torneio.',
          onRetry: () =>
              ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
        ),
      );
    }

    return NexaAsyncView<TournamentDetail?>(
      value: tournamentAsync,
      onRetry: () =>
          ref.invalidate(tournamentDetailProvider(widget.tournamentId)),
      errorTitle: 'Não foi possível carregar',
      errorMessage: 'Não foi possível carregar o torneio.',
      skeleton: _wizardChrome(context, const AppLoadingView()),
      emptyWhen: (value) =>
          value == null ||
          !value.categoryOffers.any((c) => c.id == widget.categoryId),
      empty: _wizardChrome(
        context,
        AppEmptyView(
          icon: Icons.category_outlined,
          title: 'Categoria não encontrada',
          subtitle: 'Ela pode ter sido removida ou o link está desatualizado.',
          actionLabel: 'Voltar',
          onAction: _exit,
        ),
      ),
      data: (value) {
        final tournament = value!;
        final category = tournament.categoryOffers.firstWhere(
          (c) => c.id == widget.categoryId,
        );
        // Explicitamente > 2: `TournamentCategoryOffer.isTeamCategory` conta
        // `teamSize != null`, mas uma dupla com `teamSize == 2` explícito
        // ainda é dupla na UI — mesmo corte que `_PriceCard` usa na tela de
        // condições.
        final isTeam = category.teamSize != null && category.teamSize! > 2;
        final registrationId = widget.registrationId?.trim() ?? '';

        return RegistrationWizardScaffold(
          title: isTeam ? 'Elenco' : 'Parceiro',
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: isTeam
              ? _buildTeamStickyBar(category, registrationId)
              : _buildDuplaStickyBar(category),
          children: isTeam
              ? _buildTeamBody(tournament, category, registrationId)
              : _buildDuplaBody(tournament, category, registrationId),
        );
      },
    );
  }

  // ── variante dupla ──────────────────────────────────────────────────────

  List<Widget> _buildDuplaBody(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
    String registrationId,
  ) {
    final myGender = ref.watch(athleteProfileProvider).valueOrNull?.gender;
    final hasRegistration = registrationId.isNotEmpty;

    // Com inscrição já criada, o servidor recusa `registerSolo` por definição
    // ("Você já possui inscrição nesta categoria.",
    // `tournament-partner-invite.ts`). Oferecer o cartão de reserva ali é
    // convidar o atleta a bater num erro — o lugar dele é justamente onde
    // entra "garantir a vaga pagando o integral" (abaixo).
    final allowsSolo = !tournament.requireFormedPair && !hasRegistration;

    // Reserva solo em aberto e ainda não paga: pagar o valor INTEGRAL garante
    // a vaga desde já, e o parceiro que aceitar depois entra sem taxa. A ação
    // existia no cartão de elenco da tela única e ficou sem caminho no wizard
    // — o porteiro nunca honra `step=payment` com parceiro pendente, porque
    // pagamento (5) é posterior a parceiro (3). A tela de pagamento já trata
    // este estado (`registrationAwaitingSoloPartner` pré-seleciona 'full').
    final snap = hasRegistration
        ? ref
              .watch(tournamentRegistrationSnapshotProvider(registrationId))
              .valueOrNull
        : null;
    final canGuaranteeSpot =
        category.entryFee > 0 &&
        registrationAwaitingSoloPartner(
          snap: snap,
          isFullyPaid: snap?.isPaid ?? false,
        );

    return [
      if (canGuaranteeSpot) ...[
        RegistrationWizardNotice(
          child: Text(
            registrationRosterNote(
              isTeamCategory: false,
              rosterCount: snap!.participantUids.length,
              teamSize: category.rosterSize,
              isCaptain: true,
              isPaid: false,
              hasPendingInvite: sentPendingInvitesFor(
                invites:
                    ref
                        .watch(inviterTournamentPartnerInvitesProvider)
                        .valueOrNull ??
                    const [],
                tournamentId: widget.tournamentId,
                categoryId: widget.categoryId,
              ).isNotEmpty,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        OutlinedButton(
          onPressed: _submitting
              ? null
              : () => _goToPayment(registrationId),
          child: const Text('Garantir vaga pagando o valor integral'),
        ),
        const SizedBox(height: AppSpacing.lg),
      ],
      TournamentRegistrationPartnerStep(
        category: category,
        selectedUserId: _selected?.userId,
        onSelected: (candidate) => setState(() => _selected = candidate),
        onInviteByLink: _submitting
            ? () {}
            : () => _shareByLink(tournament, category),
        onRegisterSolo: allowsSolo
            ? (_submitting ? null : () => _registerSolo(category))
            : null,
        currentGenders: [myGender],
      ),
    ];
  }

  /// Abre o pagamento de uma inscrição que JÁ existe. Mesma rota e mesmos
  /// parâmetros que `_advanceAfterSuccess` usa — nenhum estado novo.
  void _goToPayment(String registrationId) {
    context.pushNamed(
      AppRouteNames.tournamentRegistrationPayment,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        'registrationId': registrationId,
      },
    );
  }

  Widget _buildDuplaStickyBar(TournamentCategoryOffer category) {
    final candidate = _selected;
    return TournamentRegistrationStickyBar(
      enabled: candidate != null && !_submitting,
      submitting: _submitting,
      ctaLabel: candidate != null
          ? 'Convidar ${_firstNameOf(candidate.name)}'
          : 'Convidar parceiro',
      ctaSubtitle: 'o pagamento abre quando ele aceitar',
      onConfirm: () => _sendInvite(category),
    );
  }

  // ── variante equipe ─────────────────────────────────────────────────────

  List<Widget> _buildTeamBody(
    TournamentDetail tournament,
    TournamentCategoryOffer category,
    String registrationId,
  ) {
    if (registrationId.isEmpty) {
      return [
        RegistrationWizardNotice(
          child: Text(
            'Categoria de ${category.formatLabel.toLowerCase()}: crie a '
            'equipe com um nome e convide os atletas depois.',
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        TextField(
          controller: _teamNameController,
          textCapitalization: TextCapitalization.words,
          maxLength: 40,
          decoration: InputDecoration(
            labelText: 'Nome da equipe',
            hintText: 'Ex.: ${category.formatLabel} Calango',
            counterText: '',
          ),
        ),
      ];
    }

    final snap = ref
        .watch(tournamentRegistrationSnapshotProvider(registrationId))
        .valueOrNull;
    if (snap == null) {
      // Assinatura ainda não resolveu (ou inscrição sumiu) — placeholder
      // leve em vez de estourar; o snapshot chega no próximo frame.
      return const [
        SizedBox(
          height: 120,
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }

    final myUid = ref.watch(athleteProfileProvider).valueOrNull?.id;
    final sentInvites = sentPendingInvitesFor(
      invites:
          ref.watch(inviterTournamentPartnerInvitesProvider).valueOrNull ??
          const [],
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    final profiles =
        ref
            .watch(registrationRosterProfilesProvider(snap.participantUids))
            .valueOrNull ??
        const <String, AppUserProfile>{};
    final remainingSlots = registrationRemainingInviteSlots(
      teamSize: category.rosterSize,
      rosterCount: snap.participantUids.length,
      pendingInviteCount: sentInvites.length,
    );
    final myGender = ref.watch(athleteProfileProvider).valueOrNull?.gender;
    final isCaptain = _isTeamCaptain(snap, myUid);

    return [
      TournamentRegistrationRosterCard(
        teamName: snap.teamName,
        members: buildTeamRoster(
          participantUids: snap.participantUids,
          captainUid: snap.captainUid,
          myUid: myUid,
          nameByUid: {
            for (final e in profiles.entries) e.key: appUserDisplayName(e.value),
          },
          photoByUid: {
            for (final e in profiles.entries)
              if (e.value.profilePhotoUrl?.isNotEmpty ?? false)
                e.key: e.value.profilePhotoUrl!,
          },
        ),
        remainingSlots: remainingSlots,
      ),
      // Só o capitão convida: o servidor recusa qualquer outro integrante
      // ("Apenas o capitão convida atletas para a equipe.",
      // `tournament-partner-invite.ts`). A tela única fazia essa distinção com
      // `registrationRosterNote(isCaptain: …)`; sem ela, o integrante comum via
      // a busca inteira só para levar um erro no fim.
      if (!isCaptain) ...[
        const SizedBox(height: AppSpacing.lg),
        RegistrationWizardNotice(
          child: Text(
            registrationRosterNote(
              isTeamCategory: true,
              rosterCount: snap.participantUids.length,
              teamSize: category.rosterSize,
              isCaptain: false,
              isPaid: snap.isPaid,
              hasPendingInvite: sentInvites.isNotEmpty,
            ),
          ),
        ),
      ] else if (remainingSlots > 0) ...[
        const SizedBox(height: AppSpacing.lg),
        TournamentRegistrationPartnerStep(
          category: category,
          selectedUserId: _selected?.userId,
          onSelected: (candidate) => setState(() => _selected = candidate),
          onInviteByLink: _submitting
              ? () {}
              : () => _shareByLink(tournament, category, teamName: snap.teamName),
          excludeUserIds: {
            ...snap.participantUids,
            ...sentInvites.map((i) => i.inviteeUid),
          },
          // Quem já ocupa vaga define o gênero que falta na composição da
          // equipe (mesma lógica da tela única) — meu próprio gênero entra
          // pelo perfil, os demais pelos perfis públicos do elenco.
          currentGenders: [
            myGender,
            for (final uid in snap.participantUids)
              if (uid != myUid) profiles[uid]?.gender,
          ],
        ),
      ] else ...[
        const SizedBox(height: AppSpacing.lg),
        const RegistrationWizardNotice(
          child: Text('Elenco completo — não há mais vagas para convidar.'),
        ),
      ],
    ];
  }

  /// Sou o capitão desta equipe?
  ///
  /// Doc antigo pode não trazer `captainUid` — aí quem criou é o `player1Id`,
  /// mesma cadeia de `buildTeamRoster` e da tela única.
  bool _isTeamCaptain(TournamentRegistrationSnapshot snap, String? myUid) {
    final captain = snap.captainUid ?? snap.player1Id;
    // Sem capitão identificável não dá para acusar ninguém de não ser: manter
    // o convite disponível deixa o servidor decidir, que é o comportamento de
    // hoje. O contrário esconderia a ação do capitão de verdade.
    if (captain == null || captain.isEmpty) return true;
    return captain == myUid;
  }

  Widget _buildTeamStickyBar(
    TournamentCategoryOffer category,
    String registrationId,
  ) {
    if (registrationId.isEmpty) {
      return TournamentRegistrationStickyBar(
        enabled: !_submitting,
        submitting: _submitting,
        ctaLabel: 'Criar equipe',
        onConfirm: () => _createTeam(category),
      );
    }

    final snap = ref
        .watch(tournamentRegistrationSnapshotProvider(registrationId))
        .valueOrNull;
    final myUid = ref.watch(athleteProfileProvider).valueOrNull?.id;
    // Integrante comum não convida (o servidor recusa) — mas também não pode
    // ficar preso: o passo dele é seguir para uniforme/pagamento, que é para
    // onde `_advanceAfterSuccess` leva com o id já conhecido.
    if (snap != null && !_isTeamCaptain(snap, myUid)) {
      return TournamentRegistrationStickyBar(
        enabled: !_submitting,
        submitting: _submitting,
        ctaLabel: 'Continuar',
        onConfirm: () => _advanceAfterSuccess(category, registrationId),
      );
    }

    final candidate = _selected;
    return TournamentRegistrationStickyBar(
      enabled: candidate != null && !_submitting,
      submitting: _submitting,
      ctaLabel: 'Convidar para a equipe',
      onConfirm: () => _sendInvite(category),
    );
  }
}

/// Casca mínima para os estados de carregando/erro/vazio: `Scaffold` +
/// `SafeArea`, igual às telas irmãs. Só usada em `skeleton`/`empty`/erro — o
/// ramo `data` já devolve `RegistrationWizardScaffold` (que É um `Scaffold`).
Widget _wizardChrome(BuildContext context, Widget child) {
  return Scaffold(
    backgroundColor: context.themeColors.canvas,
    body: SafeArea(child: child),
  );
}

String _firstNameOf(String name) =>
    name.trim().split(RegExp(r'\s+')).first;
