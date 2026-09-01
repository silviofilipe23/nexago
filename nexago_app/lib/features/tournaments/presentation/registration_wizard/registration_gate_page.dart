import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../data/tournament_registration_service.dart';
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
  });

  final String tournamentId;
  final String? categoryId;
  final String? registrationId;
  final String? inviteId;
  final bool lgpdAccepted;
  final RegistrationWizardStep? requestedStep;

  @override
  ConsumerState<RegistrationGatePage> createState() =>
      _RegistrationGatePageState();
}

class _RegistrationGatePageState extends ConsumerState<RegistrationGatePage> {
  /// Uma decisão só por entrada. Sem esta guarda, cada snapshot novo do
  /// Firestore reempurraria a rota por cima da tela que o atleta está usando.
  bool _navigated = false;

  /// Categoria a considerar, em ordem de prioridade: a da rota; a da inscrição
  /// indicada; a de um convite recebido; a de um convite que EU enviei; a
  /// única categoria do torneio.
  /// `null` = não dá para resolver, e o destino é a tela 1.
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

  void _go(
    RegistrationWizardStep step,
    String? categoryId,
    String? registrationId,
  ) {
    if (_navigated) return;
    _navigated = true;

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
      if (regId.isEmpty) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.pushReplacementNamed(
          AppRouteNames.tournamentRegistrationDetail,
          pathParameters: {
            'tournamentId': widget.tournamentId,
            'registrationId': regId,
          },
        );
      });
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

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.pushReplacementNamed(
        name,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: params,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    // O loader precisa de `Scaffold`: solto na árvore, qualquer texto cairia
    // no estilo de erro do Flutter (sublinhado amarelo).
    final loader = Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: const Center(child: CircularProgressIndicator()),
    );

    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final registrationsAsync = ref.watch(
      tournamentUserRegistrationsByCategoryProvider(widget.tournamentId),
    );
    final receivedAsync = ref.watch(pendingTournamentPartnerInvitesProvider);
    final sentAsync = ref.watch(inviterTournamentPartnerInvitesProvider);
    // A sessão entra na espera junto: o uniforme é lido pelo SLOT do atleta, e
    // com o uid ainda vazio o slot volta em branco — mandaria de volta ao
    // uniforme quem já tinha escolhido tudo.
    final authAsync = ref.watch(authProvider);

    // Enquanto QUALQUER uma das cinco leituras não resolveu, o porteiro
    // espera. Chutar aqui é o bug antigo: sem as inscrições, "retomar" perde
    // para "começar"; sem os convites enviados, quem já convidou refaz o
    // consentimento.
    final tournament = tournamentAsync.valueOrNull;
    if (tournament == null ||
        !registrationsAsync.hasValue ||
        !receivedAsync.hasValue ||
        !sentAsync.hasValue ||
        !authAsync.hasValue) {
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
    final registration = registrations[categoryId];

    // O snapshot só existe com inscrição; sem ela não há uniforme a conferir.
    // Com inscrição, ele entra na mesma regra de esperar: tratar "doc ainda
    // não voltou" como "sem uniforme" mandaria para o uniforme quem já
    // escolheu tudo.
    TournamentRegistrationSnapshot? snap;
    if (registration != null) {
      final snapAsync = ref.watch(
        tournamentRegistrationSnapshotProvider(registration.registrationId),
      );
      if (!snapAsync.hasValue) return loader;
      snap = snapAsync.value;
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
        hasRegistration: registration != null,
        // Inscrição existente já teve o aceite carimbado pela callable.
        lgpdAccepted: widget.lgpdAccepted || registration != null,
        partnerPending: registration?.partnerPending ?? false,
        uniformRequired: uniformRequired,
        uniformComplete:
            !uniformRequired ||
            (snap != null &&
                isUniformSelectionComplete(
                  category: category,
                  selection: snap.uniformFor(myUid),
                )),
        isPaid: registration?.isPaid ?? false,
        requestedStep: widget.requestedStep,
      ),
    );

    _go(step, categoryId, registration?.registrationId);
    return loader;
  }
}
