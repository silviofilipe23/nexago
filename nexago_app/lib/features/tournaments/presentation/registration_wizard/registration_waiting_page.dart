import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../data/tournament_partner_invite_service.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_invite_announcer.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/tournament_registration/tournament_registration_waiting_step.dart';

/// Passo 5 do wizard: **aguardando a dupla**.
///
/// Entre o parceiro (4) e o uniforme (6). Antes desta tela, quem enviava o
/// convite voltava ao porteiro e caía de novo na busca de parceiro — com o
/// campo de busca aberto, logo depois de ter escolhido alguém.
///
/// Casca nova em volta do [TournamentRegistrationWaitingStep], que JÁ existe
/// (cartão da dupla, parceiro pendente, sair do fluxo, e o estado
/// `inviteAccepted`) — **não reescrito aqui**.
///
/// Neste momento **não existe inscrição**: o backend só a cria quando o
/// convidado aceita (`tournament-partner-invite.ts`). Daí as duas
/// consequências que governam a tela:
///
/// - **"Cancelar" cancela o CONVITE**, não a inscrição — não há inscrição a
///   cancelar. Volta para o passo do parceiro, onde dá para convidar outra
///   pessoa.
/// - **O aceite chega pelo mesmo stream que já alimenta a tela.**
///   `inviterTournamentPartnerInvitesProvider` traz os convites `pending`
///   **e** `accepted` do convidante, e o aceite carimba `registrationId` no
///   próprio convite. Não é preciso um segundo listener para descobrir a
///   inscrição que acabou de nascer.
///
/// A tela é VIVA: quando o convite vira `accepted` ela mostra a virada (orbe
/// verde, "aceitou!") por [_acceptedRevealDelay] e só então segue sozinha
/// para o uniforme (se a categoria exigir) ou para o pagamento.
class RegistrationWaitingPage extends ConsumerStatefulWidget {
  const RegistrationWaitingPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.registrationId,
    this.inviteId,
    this.lgpdAccepted = false,
  });

  final String tournamentId;
  final String categoryId;

  /// Só chega preenchido quando a inscrição já existe (reserva solo com
  /// convite em voo). No caminho normal — convite "no vácuo" — vem nulo, e o
  /// id aparece no próprio convite no instante do aceite.
  final String? registrationId;

  /// Convite a destacar, quando a rota souber qual. Sem ele a tela pega o
  /// convite pendente mais antigo da categoria.
  final String? inviteId;

  final bool lgpdAccepted;

  @override
  ConsumerState<RegistrationWaitingPage> createState() =>
      _RegistrationWaitingPageState();
}

class _RegistrationWaitingPageState
    extends ConsumerState<RegistrationWaitingPage> {
  /// Quanto tempo a virada fica na tela antes de a navegação acontecer.
  ///
  /// Pular direto para o pagamento no instante do aceite esconde do atleta o
  /// único momento em que ele descobre que a dupla fechou.
  static const _acceptedRevealDelay = Duration(milliseconds: 1500);

  Timer? _advanceTimer;

  /// Uma passagem só. Sem esta guarda, cada snapshot novo do Firestore
  /// rearmaria o timer e a navegação nunca chegaria a acontecer.
  bool _advanceArmed = false;

  bool _cancelling = false;

  /// A tela já está de saída. Duas guardas em uma:
  ///
  /// - o convite que some da coleção só devolve ao porteiro UMA vez — sem
  ///   isso, cada build repetiria o `pushReplacement` por cima da rota aberta;
  /// - o cancelamento apaga o convite, e o snapshot seguinte chegaria aqui
  ///   como "convite sumiu": sem a guarda, a volta ao porteiro correria com a
  ///   volta ao passo do parceiro, que é o destino certo desse caso.
  bool _leaving = false;

  @override
  void dispose() {
    _advanceTimer?.cancel();
    super.dispose();
  }

  // ── navegação ────────────────────────────────────────────────────────────

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

  /// Volta ao porteiro, que decide sozinho a etapa certa.
  ///
  /// É a saída de todo estado que esta tela não sabe representar: convite
  /// recusado, cancelado ou expirado, e aceite sem `registrationId` conhecido.
  /// O aceite LGPD tem de ATRAVESSAR — sem inscrição criada ele só existe como
  /// parâmetro de rota, e perdê-lo aqui faria a callable seguinte gravar a
  /// inscrição sem o consentimento (em silêncio, sem erro e sem log).
  void _backToGate() {
    context.pushReplacementNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        if (widget.lgpdAccepted) 'lgpd': '1',
      },
    );
  }

  /// Convite cancelado: o lugar do atleta é a busca de parceiro, para chamar
  /// outra pessoa. Mesmos parâmetros com que ele chegou lá da primeira vez.
  void _backToPartnerStep() {
    context.pushReplacementNamed(
      AppRouteNames.tournamentRegistrationPartner,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        if ((widget.registrationId?.trim() ?? '').isNotEmpty)
          'registrationId': widget.registrationId!.trim(),
        if (widget.lgpdAccepted) 'lgpd': '1',
      },
    );
  }

  /// Agenda a saída da tela depois da virada. Idempotente de propósito: é
  /// chamada de dentro do `build`, que roda a cada snapshot.
  void _armAdvance({
    required TournamentCategoryOffer category,
    required String registrationId,
  }) {
    if (_advanceArmed) return;
    _advanceArmed = true;
    _advanceTimer = Timer(_acceptedRevealDelay, () {
      if (!mounted) return;
      if (registrationId.isEmpty) {
        // Aceite sem id conhecido: inventar um seria pior que perguntar ao
        // porteiro, que deriva o passo do Firestore.
        _backToGate();
        return;
      }
      context.pushReplacementNamed(
        categoryRequiresUniform(category)
            ? AppRouteNames.tournamentRegistrationUniform
            : AppRouteNames.tournamentRegistrationPayment,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {
          'categoryId': widget.categoryId,
          'registrationId': registrationId,
        },
      );
    });
  }

  // ── ações ────────────────────────────────────────────────────────────────

  Future<void> _cancelInvite(TournamentPartnerInvite invite) async {
    if (_cancelling) return;
    final firstName = _firstNameOf(invite.inviteeName);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancelar o convite?'),
        content: Text(
          'O convite para $firstName será cancelado e você volta para a '
          'escolha do parceiro. Sua inscrição ainda não foi criada, então '
          'nada é perdido.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancelar convite'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelInvite(invite.id);
      if (!mounted) return;
      // O convite acabou de sumir da coleção; quem manda no destino é esta
      // ação, não o ramo genérico de "convite sumiu".
      _leaving = true;
      showAppSnackBar(context, 'Convite cancelado.');
      _backToPartnerStep();
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível cancelar o convite. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  // ── build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final invitesAsync = ref.watch(inviterTournamentPartnerInvitesProvider);

    // Mesma guarda das telas irmãs: SÓ `hasError`, sem `&& !hasValue` — erro
    // numa assinatura já estabelecida preserva o valor anterior no mesmo
    // `AsyncValue`, e mostrar dado velho como se fosse ao vivo é justamente o
    // que uma tela de espera não pode fazer.
    if (tournamentAsync.hasError || invitesAsync.hasError) {
      return _wizardChrome(
        context,
        AppErrorView(
          title: 'Não foi possível carregar',
          message: 'Não foi possível acompanhar o convite. Verifique sua '
              'conexão e tente de novo.',
          onRetry: () {
            ref.invalidate(tournamentDetailProvider(widget.tournamentId));
            ref.invalidate(inviterTournamentPartnerInvitesProvider);
          },
        ),
      );
    }

    final tournament = tournamentAsync.valueOrNull;
    if (tournament == null || !invitesAsync.hasValue) {
      return _wizardChrome(context, const AppLoadingView());
    }

    final category = tournament.categoryOffers
        .where((c) => c.id == widget.categoryId)
        .firstOrNull;
    if (category == null) {
      return _wizardChrome(
        context,
        AppEmptyView(
          icon: Icons.category_outlined,
          title: 'Categoria não encontrada',
          subtitle: 'Ela pode ter sido removida ou o link está desatualizado.',
          actionLabel: 'Voltar',
          onAction: _exit,
        ),
      );
    }

    final invite = _currentInvite(invitesAsync.value!);
    if (invite == null) {
      // Convite recusado, cancelado ou expirado enquanto a tela estava
      // aberta: não há espera a mostrar. O porteiro sabe para onde ir.
      if (!_leaving) {
        _leaving = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _backToGate();
        });
      }
      return _wizardChrome(context, const AppLoadingView());
    }

    final accepted = invite.isAccepted;
    if (accepted) {
      _armAdvance(
        category: category,
        registrationId:
            invite.registrationId?.trim().isNotEmpty == true
            ? invite.registrationId!.trim()
            : (widget.registrationId?.trim() ?? ''),
      );
    }

    final profile = ref.watch(athleteProfileProvider).valueOrNull;

    return RegistrationWizardScaffold(
      title: 'Aguardando a dupla',
      subtitle: tournament.name,
      onBack: _exit,
      children: [
        TournamentRegistrationWaitingStep(
          partner: _partnerOf(invite),
          athleteDisplayName: profile != null
              ? athleteDisplayName(profile)
              : 'Você',
          athleteInitials: profile != null ? athleteInitials(profile) : '?',
          athleteAvatarUrl: profile?.avatarUrl,
          // Não existe callable de reenvio para convite de dupla:
          // `resendSubstitutionInvite` recusa qualquer convite que não seja de
          // substituição (`failed-precondition`). Sem ação real, o botão fica
          // fora da tela em vez de mentir.
          onResendInvite: null,
          onCancelRegistration: () => _cancelInvite(invite),
          cancelLabel: 'Cancelar convite',
          onContinueBrowsing: _exit,
          inviteAccepted: accepted,
          partnerPendingSubtitle: accepted ? 'Confirmado' : 'Convite enviado',
          reservationHoursLabel: partnerInviteRemainingLabel(invite),
          isLoading: _cancelling,
        ),
      ],
    );
  }

  /// O convite que esta tela acompanha.
  ///
  /// Preferência para o id que a rota afirma; depois o pendente mais antigo
  /// (o mais perto de expirar); e, por fim, um ACEITO da categoria — este
  /// último é o que sustenta a virada, já que `sentPendingInvitesFor` filtra
  /// justamente os pendentes e o aceite esvaziaria a tela no pior momento.
  TournamentPartnerInvite? _currentInvite(
    List<TournamentPartnerInvite> invites,
  ) {
    final wanted = widget.inviteId?.trim() ?? '';
    if (wanted.isNotEmpty) {
      final match = invites.where((i) => i.id == wanted).firstOrNull;
      if (match != null) return match;
    }

    final pending = sentPendingInvitesFor(
      invites: invites,
      tournamentId: widget.tournamentId,
      categoryId: widget.categoryId,
    );
    if (pending.isNotEmpty) return pending.first;

    return invites
        .where(
          (i) =>
              i.isAccepted &&
              i.tournamentId == widget.tournamentId &&
              i.categoryId == widget.categoryId,
        )
        .firstOrNull;
  }

  /// Cartão do parceiro a partir do convite — nome e iniciais, sem foto.
  ///
  /// O convite guarda `inviteeName`/`inviteeUid` e nada mais; buscar o perfil
  /// só pela foto custaria uma leitura numa tela cujo trabalho é esperar. O
  /// avatar tracejado com iniciais é justamente o desenho do parceiro
  /// pendente.
  TournamentRegistrationPartnerCandidate _partnerOf(
    TournamentPartnerInvite invite,
  ) {
    final name = invite.inviteeName.trim().isEmpty
        ? 'Parceiro'
        : invite.inviteeName.trim();
    return TournamentRegistrationPartnerCandidate(
      userId: invite.inviteeUid,
      initials: initialsFromDisplayName(name),
      name: name,
      rankLabel: '',
    );
  }
}

/// Quanto ainda resta do convite, em texto: "48 horas", "3 horas", "1 hora".
///
/// O widget usa isso na frase "sua vaga fica reservada por …". O default dele
/// ('24 horas') é um chute: o convite nasce com validade própria (`expiresAt`)
/// e o que interessa ao atleta é o que sobra dela, não o tamanho original.
String partnerInviteRemainingLabel(
  TournamentPartnerInvite invite, {
  DateTime? now,
}) {
  final remaining = invite.expiresAt.difference(now ?? DateTime.now());
  if (remaining.inMinutes <= 0) return 'poucos minutos';
  final hours = (remaining.inMinutes / 60).ceil();
  if (hours <= 1) return '1 hora';
  return '$hours horas';
}

/// Casca mínima para carregando/erro/vazio: `Scaffold` + `SafeArea`, igual às
/// telas irmãs. O ramo normal devolve `RegistrationWizardScaffold`, que já é
/// um `Scaffold`.
Widget _wizardChrome(BuildContext context, Widget child) {
  return Scaffold(
    backgroundColor: context.themeColors.canvas,
    body: SafeArea(child: child),
  );
}

String _firstNameOf(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'seu parceiro';
  return trimmed.split(RegExp(r'\s+')).first;
}
