import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_status_views.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../data/tournament_registration_service.dart';
import '../../domain/category_level_eligibility.dart';
import '../../domain/registration_wizard_step.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_providers.dart';
import '../../domain/tournament_uniform_selection.dart';

/// Redirecionador de `/torneios/:tournamentId/inscricao`.
///
/// Não tem UI própria além do loader: lê torneio, inscrições e convites, chama
/// [resolveRegistrationStep] e substitui a si mesmo pela tela da etapa.
///
/// Espera os streams RESOLVEREM antes de decidir. Decidir no primeiro build,
/// com as inscrições ainda vazias, fazia "retomar o que já começou" perder
/// para "primeira categoria livre" — o beco sem saída da vaga solo pendente.
class RegistrationGatePage extends ConsumerStatefulWidget {
  const RegistrationGatePage({
    super.key,
    required this.tournamentId,
    this.categoryId,
    this.registrationId,
    this.inviteId,
    this.lgpdAccepted = false,
    this.requestedStep,
    this.requestedStepWaitingOnly = false,
  });

  final String tournamentId;
  final String? categoryId;
  final String? registrationId;
  final String? inviteId;
  final bool lgpdAccepted;
  final RegistrationWizardStep? requestedStep;

  /// O pedido veio de `?step=waiting` — ver [RegistrationStepInput].
  final bool requestedStepWaitingOnly;

  @override
  ConsumerState<RegistrationGatePage> createState() =>
      _RegistrationGatePageState();
}

class _RegistrationGatePageState extends ConsumerState<RegistrationGatePage> {
  /// Uma decisão só por entrada. Sem esta guarda, cada snapshot novo do
  /// Firestore reempurraria a rota por cima da tela que o atleta está usando.
  bool _navigated = false;

  /// Carência antes de declarar morto o `registrationId` que a rota afirma.
  ///
  /// `watchRegistration` mapeia `!snap.exists` para `null`, e um doc que ainda
  /// não está no cache local emite exatamente isso ANTES da resposta do
  /// servidor — o caso normal logo depois do aceite de convite, que acabou de
  /// criar a inscrição. Sem a carência, o caminho mais comum piscaria
  /// "Inscrição não encontrada" antes de seguir.
  static const _deadRegistrationGrace = Duration(seconds: 3);

  /// Ligado quando a carência acima vence sem o snapshot aparecer.
  bool _registrationLooksDead = false;
  Timer? _deadRegistrationTimer;

  /// Arma (uma vez) a carência do id afirmado pela rota.
  void _armDeadRegistrationTimer() {
    if (_registrationLooksDead || _deadRegistrationTimer != null) return;
    _deadRegistrationTimer = Timer(_deadRegistrationGrace, () {
      if (!mounted) return;
      setState(() => _registrationLooksDead = true);
    });
  }

  void _disarmDeadRegistrationTimer() {
    _deadRegistrationTimer?.cancel();
    _deadRegistrationTimer = null;
  }

  @override
  void dispose() {
    _disarmDeadRegistrationTimer();
    super.dispose();
  }

  /// Categoria a considerar, em ordem de prioridade: a da rota; a da inscrição
  /// indicada; a de um convite recebido; a de um convite que EU enviei; a
  /// única categoria do torneio.
  /// `null` = não dá para resolver, e o destino é a LISTA de categorias.
  String? _resolveCategoryId({
    required TournamentDetail tournament,
    required Map<String, UserCategoryRegistration> registrations,
    required List<TournamentPartnerInvite> received,
    required List<TournamentPartnerInvite> sent,
  }) {
    final offers = tournament.categoryOffers;
    final wanted = widget.categoryId?.trim() ?? '';
    if (wanted.isNotEmpty && offers.any((c) => c.id == wanted)) return wanted;

    final regId = widget.registrationId?.trim() ?? '';
    if (regId.isNotEmpty) {
      for (final entry in registrations.entries) {
        if (entry.value.registrationId == regId) return entry.key;
      }
    }

    final inviteId = widget.inviteId?.trim() ?? '';
    for (final invite in [...received, ...sent]) {
      if (invite.tournamentId != widget.tournamentId) continue;
      if (!invite.isPending || invite.isExpired) continue;
      if (inviteId.isNotEmpty && invite.id != inviteId) continue;
      if (!offers.any((c) => c.id == invite.categoryId)) continue;
      return invite.categoryId;
    }

    if (offers.length == 1) return offers.first.id;
    return null;
  }

  void _replaceWith(String routeName, {
    Map<String, String> pathParameters = const {},
    Map<String, String> queryParameters = const {},
  }) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.pushReplacementNamed(
        routeName,
        pathParameters: {
          'tournamentId': widget.tournamentId,
          ...pathParameters,
        },
        queryParameters: queryParameters,
      );
    });
  }

  void _go(
    RegistrationWizardStep step,
    String? categoryId,
    String? registrationId,
  ) {
    if (_navigated) return;

    final params = <String, String>{
      if (categoryId != null && categoryId.isNotEmpty) 'categoryId': categoryId,
      if (registrationId != null && registrationId.isNotEmpty)
        'registrationId': registrationId,
      if (widget.lgpdAccepted) 'lgpd': '1',
    };

    // O detalhe da inscrição tem `registrationId` no CAMINHO, não na query —
    // mandar por queryParameters estoura com "missing path parameter".
    if (step == RegistrationWizardStep.sucesso) {
      final regId = registrationId ?? '';
      // Sem id não há detalhe a abrir. O portão fica ABERTO de propósito: se
      // fechasse aqui, o build seguinte (com o id já resolvido) não navegaria
      // mais e a tela ficaria em loader para sempre.
      if (regId.isEmpty) return;
      _navigated = true;
      _replaceWith(
        AppRouteNames.tournamentRegistrationDetail,
        pathParameters: {'registrationId': regId},
      );
      return;
    }

    // A tela 1 do wizard mostra UMA categoria vinda da rota — ela não é um
    // seletor. Sem categoria resolvida, o lugar de escolher é a lista do
    // torneio; mandar para a tela 1 sem `categoryId` dava
    // "Categoria não encontrada".
    if (step == RegistrationWizardStep.categoria &&
        (categoryId == null || categoryId.isEmpty)) {
      _navigated = true;
      _replaceWith(AppRouteNames.tournamentCategories);
      return;
    }

    final name = switch (step) {
      RegistrationWizardStep.categoria =>
        AppRouteNames.tournamentRegistrationCategory,
      RegistrationWizardStep.consentimento =>
        AppRouteNames.tournamentRegistrationConsent,
      RegistrationWizardStep.condicoes =>
        AppRouteNames.tournamentRegistrationTerms,
      RegistrationWizardStep.parceiro =>
        AppRouteNames.tournamentRegistrationPartner,
      RegistrationWizardStep.uniforme =>
        AppRouteNames.tournamentRegistrationUniform,
      RegistrationWizardStep.pagamento =>
        AppRouteNames.tournamentRegistrationPayment,
      // `sucesso` já saiu acima (path param próprio).
      RegistrationWizardStep.sucesso =>
        AppRouteNames.tournamentRegistrationDetail,
    };

    _navigated = true;
    _replaceWith(name, queryParameters: params);
  }

  void _retry() {
    ref.invalidate(tournamentDetailProvider(widget.tournamentId));
    ref.invalidate(
      tournamentUserRegistrationsByCategoryProvider(widget.tournamentId),
    );
    ref.invalidate(pendingTournamentPartnerInvitesProvider);
    ref.invalidate(inviterTournamentPartnerInvitesProvider);
    ref.invalidate(athleteProfileProvider);
    final regId = widget.registrationId?.trim() ?? '';
    if (regId.isNotEmpty) {
      ref.invalidate(tournamentRegistrationSnapshotProvider(regId));
    }
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.tournamentId},
    );
  }

  /// Casca do porteiro: o loader e o erro precisam de [Scaffold] (solto na
  /// árvore, qualquer texto cai no estilo de erro do Flutter) e de uma SAÍDA —
  /// o porteiro é a porta de entrada da inscrição, e ficar preso nele offline
  /// não deixa nem voltar.
  Widget _chrome(Widget child) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _leave,
          tooltip: 'Voltar',
        ),
      ),
      body: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final loader = _chrome(const Center(child: CircularProgressIndicator()));

    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final registrationsAsync = ref.watch(
      tournamentUserRegistrationsByCategoryProvider(widget.tournamentId),
    );
    final receivedAsync = ref.watch(pendingTournamentPartnerInvitesProvider);
    final sentAsync = ref.watch(inviterTournamentPartnerInvitesProvider);
    // A sessão entra na espera junto por dois motivos: o uniforme é lido pelo
    // SLOT do atleta (uid vazio devolve slot em branco), e os providers de
    // convite respondem lista VAZIA quando não há uid — um convite recebido de
    // verdade sumiria.
    final authAsync = ref.watch(authProvider);
    // O perfil decide a folha de nível. `needsLevelConfirmation` trata perfil
    // nulo como "não precisa", então ler antes de emitir pularia o gate em
    // silêncio — o mesmo furo que `resolveLevelConfirmationPrompt` documenta.
    final profileAsync = ref.watch(athleteProfileProvider);

    // Erro é ERRO, não "ainda carregando": `valueOrNull`/`hasValue` engolem
    // `AsyncError` e o porteiro viraria um spinner permanente na porta de
    // entrada da inscrição. Só `hasError`, sem `&& !hasValue` — dado antigo e
    // erro novo coexistem no mesmo `AsyncValue` (mesma guarda das telas
    // irmãs deste wizard).
    final failed =
        tournamentAsync.hasError ||
        registrationsAsync.hasError ||
        receivedAsync.hasError ||
        sentAsync.hasError ||
        authAsync.hasError ||
        profileAsync.hasError;
    if (failed) {
      return _chrome(
        AppErrorView(
          title: 'Não foi possível abrir a inscrição',
          message:
              'Verifique sua conexão e tente de novo. Se continuar, volte e '
              'entre pelo torneio.',
          onRetry: _retry,
        ),
      );
    }

    // Enquanto QUALQUER uma das leituras não resolveu, o porteiro espera.
    // Chutar aqui é o bug antigo: sem as inscrições, "retomar" perde para
    // "começar"; sem os convites enviados, quem já convidou refaz o
    // consentimento.
    final tournament = tournamentAsync.valueOrNull;
    if (tournament == null ||
        !registrationsAsync.hasValue ||
        !receivedAsync.hasValue ||
        !sentAsync.hasValue ||
        !authAsync.hasValue ||
        !profileAsync.hasValue) {
      return loader;
    }

    final registrations = registrationsAsync.value!;
    final received = receivedAsync.value!;
    final sent = sentAsync.value!;

    final categoryId = _resolveCategoryId(
      tournament: tournament,
      registrations: registrations,
      received: received,
      sent: sent,
    );
    if (categoryId == null) {
      _go(RegistrationWizardStep.categoria, null, null);
      return loader;
    }

    final category = tournament.categoryOffers.firstWhere(
      (c) => c.id == categoryId,
    );

    // A ROTA é autoridade sobre "existe inscrição". O mapa vem de um
    // `snapshots()` do Firestore, que entrega o CACHE primeiro: logo depois do
    // aceite, a inscrição recém-criada pode não estar nele, `hasValue` já é
    // `true` e o atleta cairia no consentimento. A tela única sobrevivia por
    // ser tela viva e se corrigir no snapshot seguinte; o porteiro decide uma
    // vez só.
    final mapped = registrations[categoryId];
    final routeRegId = widget.registrationId?.trim() ?? '';
    final routeRegIsFromAnotherCategory =
        routeRegId.isNotEmpty &&
        registrations.entries.any(
          (e) => e.key != categoryId && e.value.registrationId == routeRegId,
        );
    final assertedByRoute =
        routeRegId.isNotEmpty &&
        mapped == null &&
        !routeRegIsFromAnotherCategory;
    final effectiveRegistrationId =
        mapped?.registrationId ?? (assertedByRoute ? routeRegId : null);
    final hasRegistration = mapped != null || assertedByRoute;

    // O snapshot só existe com inscrição; sem ela não há uniforme a conferir.
    // Com inscrição, ele entra na mesma regra de esperar: tratar "doc ainda
    // não voltou" como "sem uniforme" mandaria para o uniforme quem já
    // escolheu tudo.
    TournamentRegistrationSnapshot? snap;
    if (effectiveRegistrationId != null) {
      final snapAsync = ref.watch(
        tournamentRegistrationSnapshotProvider(effectiveRegistrationId),
      );
      if (snapAsync.hasError) {
        return _chrome(
          AppErrorView(
            title: 'Não foi possível abrir a inscrição',
            message: 'Não foi possível carregar sua inscrição.',
            onRetry: _retry,
          ),
        );
      }
      if (!snapAsync.hasValue) return loader;
      snap = snapAsync.value;

      // A rota AFIRMOU uma inscrição que o snapshot resolveu como ausente:
      // link antigo, push de uma inscrição cancelada, id de outra conta. Sem
      // esta saída o porteiro seguia em frente com o id morto e o atleta caía
      // numa tela de pagamento que não paga, sem entender por quê.
      //
      // Só vale para o id AFIRMADO pela rota: quando ele veio do mapa por
      // categoria a inscrição existe, e um snapshot nulo ali é só atraso.
      //
      // A carência separa "não existe" de "ainda não chegou do servidor" — os
      // dois chegam aqui como `null`, e sem ela o aceite de convite (que cria
      // a inscrição no instante anterior) piscaria o erro. `_navigated` segue
      // aberto: um snapshot que chegue depois ainda navega.
      if (assertedByRoute && snap == null) {
        if (!_registrationLooksDead) {
          _armDeadRegistrationTimer();
          return loader;
        }
        return _chrome(
          AppEmptyView(
            icon: Icons.link_off_rounded,
            title: 'Inscrição não encontrada',
            subtitle:
                'Ela pode ter sido cancelada, ou o link está desatualizado. '
                'Volte e entre pelo torneio para recomeçar.',
            actionLabel: 'Voltar',
            onAction: _leave,
          ),
        );
      }
      _disarmDeadRegistrationTimer();
    }

    final myUid = authAsync.valueOrNull?.uid.trim() ?? '';
    final uniformRequired = categoryRequiresUniform(category);

    final step = resolveRegistrationStep(
      RegistrationStepInput(
        categoryResolved: true,
        hasReceivedInvite:
            receivedInviteForCategory(
              pending: received,
              tournamentId: widget.tournamentId,
              categoryId: categoryId,
            ) !=
            null,
        // Convidar NÃO cria inscrição — o backend só cria no aceite. Sem este
        // sinal, quem já convidou e volta por push cairia no consentimento.
        hasSentInvitePending: sentPendingInvitesFor(
          invites: sent,
          tournamentId: widget.tournamentId,
          categoryId: categoryId,
        ).isNotEmpty,
        hasRegistration: hasRegistration,
        // Inscrição existente já teve o aceite carimbado pela callable.
        lgpdAccepted: widget.lgpdAccepted || hasRegistration,
        partnerPending: mapped?.partnerPending ?? snap?.partnerPending ?? false,
        uniformRequired: uniformRequired,
        uniformComplete:
            !uniformRequired ||
            (snap != null &&
                isUniformSelectionComplete(
                  category: category,
                  selection: snap.uniformFor(myUid),
                )),
        isPaid: mapped?.isPaid ?? snap?.isPaid ?? false,
        // A folha de nível abre na saída da TELA 1, e as entradas que já
        // trazem `categoryId` nunca passam por lá.
        levelConfirmationPending:
            CategoryLevelEligibility.needsLevelConfirmation(
          profileAsync.value,
          tournamentSport: tournament.sport,
        ),
        requestedStep: widget.requestedStep,
        requestedStepWaitingOnly: widget.requestedStepWaitingOnly,
      ),
    );

    _go(step, categoryId, effectiveRegistrationId);
    return loader;
  }
}
