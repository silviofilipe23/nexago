import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../data/tournament_partner_invite_service.dart';
import '../../data/tournament_registration_service.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../../domain/tournament_registration_providers.dart';
import '../../domain/uniform_auto_saver.dart';
import '../widgets/registration_wizard/registration_wizard_notice.dart';
import '../widgets/registration_wizard/registration_wizard_pill.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';
import '../widgets/tournament_registration/tournament_registration_uniform_step.dart';

/// Passo 5 do wizard: uniforme.
///
/// Casca nova em volta do [TournamentRegistrationUniformStep], que já existe
/// com autosave (`UniformAutoSaver`) — **não reescrito aqui**.
///
/// O bloco de estado do uniforme (`_uniform`, `_uniformSaveState`,
/// `_uniformSaver`, `_applyUniformDefaults`, `_hydrateUniform`,
/// `_onUniformChanged`, `_writeUniform`) é cópia literal do mesmo bloco em
/// `tournament_registration_page.dart` (linhas ~253-370). Ele resolve dois
/// problemas que não são óbvios lendo o código isolado:
///
/// - **Hidratar uma vez por inscrição.** Depois da primeira hidratação, a
///   tela manda o que o atleta está editando — senão cada snapshot novo do
///   Firestore desfaria a escolha em andamento no meio da digitação.
/// - **Meia escolha não vira gravação.** Enquanto a seleção está incompleta,
///   o autosave é cancelado e o selo volta para "Pendente" em vez de virar
///   erro.
///
/// Diferença desta tela para a tela única: aqui `registrationId` é sempre
/// conhecido (o wizard só chega neste passo depois de existir inscrição), o
/// que elimina a necessidade de derivar `_currentRegistrationId` de um mapa
/// de categorias — é sempre `widget.registrationId`.
class RegistrationUniformPage extends ConsumerStatefulWidget {
  const RegistrationUniformPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.registrationId,
  });

  final String tournamentId;
  final String categoryId;
  final String registrationId;

  @override
  ConsumerState<RegistrationUniformPage> createState() =>
      _RegistrationUniformPageState();
}

class _RegistrationUniformPageState
    extends ConsumerState<RegistrationUniformPage> {
  // ── uniforme (cópia literal de tournament_registration_page.dart:253-370) ──

  TournamentUniformSelection _uniform = const TournamentUniformSelection(
    sizeTop: 'M',
    jerseyNumber: 10,
    sizeShorts: 'M',
  );
  UniformSaveState _uniformSaveState = UniformSaveState.idle;
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

  bool _syncedJerseyNameFromProfile = false;

  TournamentCategoryOffer? _resolvedCategoryForCallbacks;

  bool _confirming = false;

  @override
  void dispose() {
    _uniformSaver.dispose();
    super.dispose();
  }

  Future<void> _writeUniform(TournamentUniformSelection selection) async {
    final regId = widget.registrationId.trim();
    if (regId.isEmpty) {
      throw TournamentPartnerInviteException(
        'Sua inscrição ainda não foi criada.',
      );
    }
    await ref
        .read(tournamentPartnerInviteServiceProvider)
        .setRegistrationUniform(registrationId: regId, uniform: selection);
  }

  void _onUniformChanged(TournamentUniformSelection value) {
    setState(() => _uniform = value);
    final category = _resolvedCategoryForCallbacks;
    if (category == null) return;
    if (validateUniformSelection(category: category, selection: value) !=
        null) {
      // Meia escolha não vira gravação — e nem vira erro enquanto o atleta
      // ainda decide; o selo só volta para "Pendente".
      _uniformSaver.cancelPending();
      return;
    }
    _uniformSaver.schedule(value);
  }

  /// Padrões do uniforme ao abrir, e o nome na camisa vindo do perfil quando
  /// ele chega depois.
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
    TournamentCategoryOffer category,
  ) {
    if (snap == null) return;
    if (!categoryRequiresUniform(category)) return;
    if (_uniformHydratedRegistrationId == snap.registrationId) return;
    final uid = ref.read(authServiceProvider).currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    _uniformHydratedRegistrationId = snap.registrationId;
    final stored = snap.uniformFor(uid);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Os padrões da categoria entram em outro post-frame agendado no MESMO
      // build; ler `_uniform` aqui dentro pega o valor já atualizado, e não o
      // anterior.
      final hydrated = hydrateUniformSelection(
        stored: stored,
        defaults: _uniform,
      );
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

  /// CTA "Salvar e continuar": grava explicitamente (não espera o debounce do
  /// autosave) e só então empurra para o pagamento — evita perder a última
  /// mexida se o atleta confirmar antes dos 600ms do autosave.
  Future<void> _confirmAndContinue(TournamentCategoryOffer category) async {
    if (_confirming) return;
    if (validateUniformSelection(category: category, selection: _uniform) !=
        null) {
      return;
    }
    setState(() => _confirming = true);
    try {
      await _writeUniform(_uniform);
      _uniformSaver.markSaved(_uniform);
      if (!mounted) return;
      context.pushNamed(
        AppRouteNames.tournamentRegistrationPayment,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {
          'categoryId': widget.categoryId,
          'registrationId': widget.registrationId,
        },
      );
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível salvar o uniforme. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  /// Uniforme dos demais participantes da inscrição (parceiro ou elenco):
  /// `true` quando todos já completaram a escolha, `false` quando falta pelo
  /// menos um, `null` quando ainda não há ninguém além de mim (dupla ainda
  /// sem parceiro, ou elenco só comigo).
  bool? _partnerUniformStatus(
    TournamentRegistrationSnapshot snap,
    TournamentCategoryOffer category,
    String? myUid,
  ) {
    final others = snap.participantUids.where((uid) => uid != myUid).toList();
    if (others.isEmpty) return null;
    return others.every(
      (uid) => isUniformSelectionComplete(
        category: category,
        selection: snap.uniformFor(uid),
      ),
    );
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
        _resolvedCategoryForCallbacks = category;
        _applyUniformDefaults(category);

        final snap = ref
            .watch(tournamentRegistrationSnapshotProvider(widget.registrationId))
            .valueOrNull;
        _hydrateUniform(snap, category);

        final closesAt = tournament.registrationClosesAt;
        final myUid = ref.read(authServiceProvider).currentUser?.uid;
        final partnerComplete = snap != null
            ? _partnerUniformStatus(snap, category, myUid)
            : null;

        return RegistrationWizardScaffold(
          title: 'Uniforme',
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: TournamentRegistrationStickyBar(
            enabled:
                validateUniformSelection(
                  category: category,
                  selection: _uniform,
                ) ==
                null,
            submitting: _confirming,
            ctaLabel: 'Salvar e continuar',
            onConfirm: () => _confirmAndContinue(category),
          ),
          children: [
            if (closesAt != null) ...[
              RegistrationWizardNotice(
                child: Text(
                  'Tamanho, número e nome podem ser alterados até '
                  '${tournamentRegistrationClosesLabel(closesAt)}. Depois '
                  'disso a produção das camisas é fechada.',
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            TournamentRegistrationUniformStep(
              compact: false,
              tournament: tournament,
              category: category,
              selection: _uniform,
              onChanged: _onUniformChanged,
              saveState: _uniformSaveState,
              onRetrySave: _uniformSaveState == UniformSaveState.failed
                  ? _uniformSaver.retry
                  : null,
            ),
            if (partnerComplete != null) ...[
              const SizedBox(height: AppSpacing.lg),
              _PartnerUniformRow(complete: partnerComplete),
            ],
          ],
        );
      },
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

/// Status do uniforme dos demais participantes da inscrição (parceiro ou
/// elenco), derivado do snapshot — não há edição aqui, só o que falta para
/// os outros fecharem a escolha deles.
class _PartnerUniformRow extends StatelessWidget {
  const _PartnerUniformRow({required this.complete});

  final bool complete;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Uniforme do parceiro',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          RegistrationWizardPill(
            label: complete ? 'COMPLETO' : 'PENDENTE',
            tone: complete
                ? RegistrationWizardPillTone.brand
                : RegistrationWizardPillTone.warn,
          ),
        ],
      ),
    );
  }
}
