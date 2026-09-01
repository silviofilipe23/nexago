import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../../core/ui/nexa_async_view.dart';
import '../../../athlete/domain/athlete_profile_providers.dart';
import '../../../athlete/domain/tournament_access_providers.dart';
import '../../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/category_age_eligibility.dart';
import '../../domain/category_gender_eligibility.dart';
import '../../domain/category_level_eligibility.dart';
import '../../domain/registration_shell_logic.dart';
import '../../domain/tournament_category_spots.dart';
import '../../domain/tournament_detail_logic.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_registration_logic.dart';
import '../widgets/registration_wizard/registration_wizard_notice.dart';
import '../widgets/registration_wizard/registration_wizard_scaffold.dart';
import '../widgets/registration_wizard/registration_wizard_spec_row.dart';
import '../widgets/tournament_registration/level_confirmation_sheet.dart';
import '../widgets/tournament_registration/tournament_registration_sticky_bar.dart';

/// Passo 1 do wizard: o detalhe da categoria.
///
/// A categoria vem da ROTA, não de um seletor: a escolha acontece na lista do
/// torneio, antes de entrar no fluxo. "Ver outras categorias" volta para lá.
///
/// A folha de confirmação de nível (anti-sandbagging) abre na SAÍDA desta
/// tela: é uma pergunta sobre caber na categoria, então vem junto da
/// categoria.
class RegistrationCategoryPage extends ConsumerStatefulWidget {
  const RegistrationCategoryPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  ConsumerState<RegistrationCategoryPage> createState() =>
      _RegistrationCategoryPageState();
}

class _RegistrationCategoryPageState
    extends ConsumerState<RegistrationCategoryPage> {
  bool _advancing = false;

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

  /// Sai para o consentimento. Antes disso, a folha de nível quando devida —
  /// recusar ali cancela a saída e o atleta continua na categoria.
  Future<void> _advance(TournamentDetail tournament) async {
    if (_advancing) return;
    setState(() => _advancing = true);
    try {
      final LevelConfirmationPrompt? prompt;
      try {
        prompt = await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
          ref.read(athleteProfileProvider.future),
          tournamentSport: tournament.sport,
        );
      } catch (_) {
        if (!mounted) return;
        showAppSnackBar(
          context,
          'Não foi possível confirmar seu nível. Tente novamente.',
          isError: true,
        );
        return;
      }
      if (!mounted) return;
      if (prompt != null) {
        final confirmed = await showLevelConfirmationSheet(
          context,
          levelLabel: prompt.levelLabel,
          sportLabel: prompt.sportLabel,
        );
        if (!mounted) return;
        if (confirmed != true) {
          if (confirmed == false) {
            context.pushNamed(AppRouteNames.athleteSportsLevels);
          }
          return;
        }
      }
      if (!mounted) return;
      context.pushNamed(
        AppRouteNames.tournamentRegistrationConsent,
        pathParameters: {'tournamentId': widget.tournamentId},
        queryParameters: {'categoryId': widget.categoryId},
      );
    } finally {
      if (mounted) setState(() => _advancing = false);
    }
  }

  /// Já inscrito: o CTA retoma pelo porteiro em vez de tentar inscrever de novo.
  void _resume(String registrationId) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': widget.tournamentId},
      queryParameters: {
        'categoryId': widget.categoryId,
        'registrationId': registrationId,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(widget.tournamentId),
    );
    final access = ref.watch(tournamentAccessStateProvider);

    // `NexaAsyncView` não tem gancho pra embrulhar o ramo de ERRO num
    // Scaffold — só `skeleton`/`empty` aceitam widget custom. Resolvo o erro
    // ANTES de entrar no `NexaAsyncView`, pra não ter que escolher entre
    // "erro sem Scaffold" e "Scaffold duplicado no caminho feliz" — o
    // caminho de dados já é um `Scaffold` inteiro via `RegistrationWizardScaffold`,
    // então essa tela nunca embrulha o `NexaAsyncView` inteiro (ver
    // `_wizardChrome` abaixo, usado só em `skeleton`/`empty`).
    //
    // A guarda é só `hasError` — SEM `&& !hasValue`. Erro numa assinatura já
    // estabelecida passa por `asyncTransition` com `seamless: true`, e
    // `AsyncError.copyWithPrevious` preserva `hasValue: previous.hasValue`:
    // dado antigo + erro novo coexistem no MESMO `AsyncValue`. O `.when()` do
    // `NexaAsyncView` usa `skipError: false` (padrão), então SEMPRE cai no
    // ramo de erro quando `hasError` é true, mesmo com valor anterior — a
    // guarda replica exatamente essa condição, senão o caso "tinha dado,
    // stream caiu depois" escapa por aqui e cai sem Scaffold lá dentro. Não
    // é caso exótico: `tournamentDetailProvider` é um `StreamProvider` sobre
    // `snapshots()` do Firestore sem `handleError` na cadeia — permissão
    // revogada, `unavailable`, queda de rede no celular depois da primeira
    // carga é o caso comum, não a exceção.
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

        final enrollmentAsync = ref.watch(
          tournamentCategoryEnrollmentCountsProvider(widget.tournamentId),
        );
        final enrollmentResolved = enrollmentAsync.hasValue;
        final enrollment = enrollmentAsync.valueOrNull ?? const <String, int>{};
        final inscriptionCount = resolveInscriptionCountForOffer(
          enrollment,
          category,
          countsResolved: enrollmentResolved,
        );
        final capacity = categoryMaxTeams(category);
        final spotsLeft = capacity > 0
            ? categorySpotsLeft(category, inscriptionCount: inscriptionCount)
            : null;

        final registrations = ref
                .watch(
                  tournamentUserRegistrationsByCategoryProvider(
                    widget.tournamentId,
                  ),
                )
                .valueOrNull ??
            const <String, UserCategoryRegistration>{};
        final registration = registrations[category.id];

        final profile = ref.watch(athleteProfileProvider).valueOrNull;
        final levelRank = CategoryLevelEligibility.athleteLevelRank(
          profile,
          tournamentSport: tournament.sport,
        );
        final status = registrationCategoryStatus(
          offer: category,
          alreadyRegistered: registration != null,
          spotsLeft: spotsLeft,
          registrationOpensAt: tournament.registrationOpensAt,
          eligibility: RegistrationEligibilityInput(
            levelBlocked: !CategoryLevelEligibility.isCategoryEligibleForLevel(
              category,
              levelRank,
            ),
            belowMinLevel:
                CategoryLevelEligibility.categoryLevelRank(category) >=
                        levelRank &&
                    levelRank <
                        CategoryLevelEligibility.categoryMinLevelRank(category),
            ageEligibility: CategoryAgeEligibility.evaluate(
              category,
              profile,
              tournamentStart: tournament.startDate,
            ),
            genderBlocked:
                !CategoryGenderEligibility.isCategoryEligibleForAthlete(
              category,
              profile,
            ),
          ),
        );

        final closesAt = tournament.registrationClosesAt;
        final pairRequired =
            tournament.requireFormedPair && !category.isTeamCategory;
        final canAdvance = access.canAccess && !status.blocked;

        return RegistrationWizardScaffold(
          title: category.name,
          subtitle: tournament.name,
          onBack: _exit,
          stickyBar: TournamentRegistrationStickyBar(
            enabled: registration != null || canAdvance,
            submitting: _advancing,
            ctaLabel: registration != null
                ? 'Continuar inscrição'
                : 'Inscrever-se',
            ctaSubtitle: status.message,
            onConfirm: () => registration != null
                ? _resume(registration.registrationId)
                : _advance(tournament),
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
            if (status.badge != null) ...[
              _Badge(status.badge!),
              const SizedBox(height: AppSpacing.lg),
            ],
            _StatTiles(
              spotsLeft: spotsLeft,
              capacity: capacity,
              levelLabel: _levelRangeLabel(category),
            ),
            const SizedBox(height: AppSpacing.lg),
            RegistrationWizardSpecRow(
              label: 'Inscrição por ${category.unitSingular}',
              value: formatRegistrationMoney(category.entryFee),
            ),
            if (closesAt != null)
              RegistrationWizardSpecRow(
                label: 'Inscrições até',
                value: tournamentRegistrationClosesLabel(closesAt),
                highlight: true,
              ),
            RegistrationWizardSpecRow(
              label: 'Formato',
              value: bracketFormatLabel(category.bracketFormat),
            ),
            // O protótipo tinha também "Sorteio da chave · 09 jul". NÃO existe
            // campo de data de sorteio — nem no app, nem nas functions, nem no
            // painel do organizador. A linha fica de fora. Ver a spec.
            if (pairRequired) ...[
              const SizedBox(height: AppSpacing.lg),
              const RegistrationWizardNotice(
                child: Text(
                  'Esta categoria só aceita inscrição em dupla — você vai '
                  'precisar informar o parceiro no próximo passo.',
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// Casca mínima para os estados de carregando/erro/vazio: `Scaffold` +
/// `SafeArea`, igual às telas irmãs (`tournament_registration_page.dart`,
/// `tournament_category_view_page.dart`, `tournament_registration_payment_page.dart`).
///
/// Só usada em `skeleton`/`empty`/erro — nunca ao redor do `NexaAsyncView`
/// inteiro, porque o ramo `data` já devolve `RegistrationWizardScaffold`
/// (que É um `Scaffold`); embrulhar tudo por fora duplicaria o Scaffold só
/// no caminho feliz.
Widget _wizardChrome(BuildContext context, Widget child) {
  return Scaffold(
    backgroundColor: context.themeColors.canvas,
    body: SafeArea(child: child),
  );
}

/// Rótulo do cartão NÍVEL.
///
/// A escada daqui é de 7 degraus NOMEADOS (não numéricos) — a categoria
/// carrega o texto cru em `level` (teto) e `minLevel` (piso), sem rank. Com
/// os dois preenchidos e diferentes mostra a faixa; com só um, esse; sem
/// nenhum, "Livre".
String _levelRangeLabel(TournamentCategoryOffer category) {
  final min = category.minLevel.trim();
  final max = category.level.trim();
  if (min.isNotEmpty && max.isNotEmpty && min != max) {
    return '$min – $max';
  }
  if (max.isNotEmpty) return max;
  if (min.isNotEmpty) return min;
  return 'Livre';
}

class _Badge extends StatelessWidget {
  const _Badge(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
        ),
        child: Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: AppColors.brand,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }
}

/// VAGAS e NÍVEL lado a lado. `spotsLeft` nulo = capacidade desconhecida
/// (categoria sem teto ou contagem ainda não resolvida): mostra travessão em
/// vez de inventar um número.
class _StatTiles extends StatelessWidget {
  const _StatTiles({
    required this.spotsLeft,
    required this.capacity,
    required this.levelLabel,
  });

  final int? spotsLeft;
  final int capacity;
  final String levelLabel;

  @override
  Widget build(BuildContext context) {
    final spots = spotsLeft;
    // `IntrinsicHeight` dá ao Row uma altura finita antes de esticar os
    // dois cartões — sem ela, `CrossAxisAlignment.stretch` herda a altura
    // solta do `ListView` (0..infinito) e o layout estoura com "BoxConstraints
    // forces an infinite height". É o preço de deixar o cartão NÍVEL quebrar
    // linha (correção 3 do brief) sem descasar a altura do cartão VAGAS.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _Tile(
              label: 'VAGAS',
              value: spots == null || capacity <= 0
                  ? '—'
                  : '$spots de $capacity',
              emphasis: spots != null && spots > 0,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: _Tile(label: 'NÍVEL', value: levelLabel)),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 6),
          // Sem `maxLines`/`overflow`: valores longos ("Intermediário 1 –
          // Avançado 2") quebram linha em vez de estourar a caixa — a
          // escada nomeada não tem o mesmo tamanho fixo do protótipo
          // ("NÍVEL 3.5 – 4.5").
          Text(
            value,
            softWrap: true,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: emphasis ? AppColors.brand : context.themeColors.onSurface,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}
