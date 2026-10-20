import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professionals/arena_professionals_logic.dart';
import '../../domain/professionals/arena_professionals_providers.dart';
import 'widgets/arena_professional_flows.dart';
import 'widgets/arena_professional_invite_sheet.dart';
import 'widgets/arena_professionals_ui.dart';

/// A1 · Profissionais (app da arena, dono + gestor): indicadores, pedidos
/// aguardando decisão, lista com busca e filtros, e o convite pelo "+".
class ArenaProfessionalsPage extends ConsumerWidget {
  const ArenaProfessionalsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scopeAsync = ref.watch(arenaProfessionalsScopeProvider);
    final scope = scopeAsync.valueOrNull;
    if (scope != null) return _ProfessionalsView(scope: scope);
    return ProfessorLinksScaffold(
      title: 'Profissionais',
      onBack: () => popOrGo(context, AppRoutes.arenaSettings),
      body: scopeAsync.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : const AppEmptyView(
              icon: Icons.lock_outline_rounded,
              title: 'Sem acesso',
              subtitle: 'Só o dono e os gestores da arena administram os '
                  'professores.',
            ),
    );
  }
}

class _ProfessionalsView extends ConsumerStatefulWidget {
  const _ProfessionalsView({required this.scope});

  final ArenaProfessionalsScope scope;

  @override
  ConsumerState<_ProfessionalsView> createState() => _ProfessionalsViewState();
}

class _ProfessionalsViewState extends ConsumerState<_ProfessionalsView> {
  final _search = TextEditingController();
  ArenaProfessorTypeFilter _type = ArenaProfessorTypeFilter.all;
  ArenaProfessorStatusGroup? _status;
  final Set<String> _busyIds = {};

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    final name = await showArenaProfessorInviteSheet(
      context,
      arenaId: widget.scope.arenaId,
    );
    if (name == null || !mounted) return;
    showAppSnackBar(
      context,
      'Convite enviado para $name. Vale por $arenaProfessorInviteTtlDays dias.',
    );
  }

  Future<void> _copyPageLink() async {
    await Clipboard.setData(
      ClipboardData(text: arenaProfessorRequestPageUrl(widget.scope.arenaId)),
    );
    if (!mounted) return;
    showAppSnackBar(
      context,
      'Link copiado. O professor pede o vínculo pela página da arena.',
    );
  }

  void _setBusy(String linkId, bool busy) {
    if (!mounted) return;
    setState(() => busy ? _busyIds.add(linkId) : _busyIds.remove(linkId));
  }

  void _open(ArenaProfessorLink link) {
    context.pushNamed(
      AppRouteNames.arenaProfessionalDetail,
      pathParameters: {'linkId': link.id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = widget.scope;
    final linksAsync = ref.watch(arenaProfessionalLinksProvider(scope.arenaId));
    final links = linksAsync.valueOrNull;
    final now = ref.watch(arenaProfessionalsClockProvider)();
    final canManage = scope.canManage;
    final arenaLabel = scope.arenaName.isEmpty ? 'Arena' : scope.arenaName;

    final Widget body;
    if (links == null) {
      body = linksAsync.hasError
          ? AppErrorView(
              title: 'Não foi possível carregar',
              message: 'Confira sua conexão e tente de novo.',
              onRetry: () => ref.invalidate(
                arenaProfessionalLinksProvider(scope.arenaId),
              ),
            )
          : const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            );
    } else if (links.isEmpty) {
      body = _EmptyState(
        canManage: canManage,
        onInvite: _invite,
        onCopyLink: _copyPageLink,
      );
    } else {
      body = _list(links, now, canManage);
    }

    return ProfessorLinksScaffold(
      title: 'Profissionais',
      subtitle: _subtitle(arenaLabel, links, now).toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.arenaSettings),
      trailing: canManage
          ? ProfessorLinksRoundButton(
              key: const Key('arena-professor-invite'),
              icon: Icons.add_rounded,
              semanticLabel: 'Convidar professor',
              filled: true,
              onTap: _invite,
            )
          : null,
      body: body,
    );
  }

  Widget _list(List<ArenaProfessorLink> links, DateTime now, bool canManage) {
    final colors = context.themeColors;
    final kpis = arenaProfessorKpis(links, now);
    final pending = pendingArenaProfessorRequests(links);
    final total = arenaProfessorRowCount(links, now);
    final rows = filterArenaProfessorRows(
      links,
      now: now,
      type: _type,
      status: _status,
      term: _search.text,
    );
    final noFilter = _type == ArenaProfessorTypeFilter.all &&
        _status == null &&
        _search.text.trim().isEmpty;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        _KpiGrid(kpis: kpis),
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 22),
          ArenaProfessorSectionHead(
            title: 'Solicitações pendentes',
            hint: pending.length == 1
                ? '1 professor pediu vínculo'
                : '${pending.length} professores pediram vínculo',
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < pending.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            ArenaProfessorRequestCard(
              link: pending[i],
              now: now,
              highlight: i == 0,
              busy: _busyIds.contains(pending[i].id),
              onAnalyze: canManage
                  ? () => analyzeArenaProfessorRequestFlow(
                        context,
                        ref,
                        pending[i],
                        onBusy: (busy) => _setBusy(pending[i].id, busy),
                      )
                  : () => _open(pending[i]),
              onReject: canManage
                  ? () => rejectArenaProfessorRequestFlow(
                        context,
                        ref,
                        pending[i],
                        onBusy: (busy) => _setBusy(pending[i].id, busy),
                      )
                  : null,
            ),
          ],
        ],
        const SizedBox(height: 24),
        const ProfessorLinksKicker('Professores'),
        const SizedBox(height: 10),
        if (total > 0) ...[
          TextField(
            key: const Key('arena-professor-search'),
            controller: _search,
            onChanged: (_) => setState(() {}),
            textInputAction: TextInputAction.search,
            style: AppTypography.bodyM.copyWith(
              fontSize: 13.5,
              color: colors.onSurface,
            ),
            decoration: arenaProfessorInputDecoration(
              context,
              hint: 'Buscar professor pelo nome',
              icon: Icons.search_rounded,
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: Row(
              children: [
                ArenaProfessorFilterChip(
                  label: 'Todos · $total',
                  selected:
                      _type == ArenaProfessorTypeFilter.all && _status == null,
                  onTap: () => setState(() {
                    _type = ArenaProfessorTypeFilter.all;
                    _status = null;
                  }),
                ),
                const SizedBox(width: 6),
                ArenaProfessorFilterChip(
                  label: 'Equipe da arena',
                  dotColor: AppColors.brandHover,
                  selected: _type == ArenaProfessorTypeFilter.arenaStaff,
                  onTap: () => _toggleType(ArenaProfessorTypeFilter.arenaStaff),
                ),
                const SizedBox(width: 6),
                ArenaProfessorFilterChip(
                  label: 'Independentes',
                  dotColor: ProfessorLinksStyle.blue,
                  selected: _type == ArenaProfessorTypeFilter.independent,
                  onTap: () =>
                      _toggleType(ArenaProfessorTypeFilter.independent),
                ),
                Container(
                  width: 1,
                  height: 22,
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  color: ProfessorLinksStyle.line2(colors),
                ),
                for (final chip in arenaProfessorStatusFilters) ...[
                  ArenaProfessorFilterChip(
                    label: chip.label,
                    selected: _status == chip.group,
                    onTap: () => setState(
                      () => _status = _status == chip.group ? null : chip.group,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Text(
              total == 0
                  ? 'Ainda não há professores vinculados — só as solicitações '
                      'acima.'
                  : noFilter
                      ? 'Nenhum professor por aqui.'
                      : 'Nenhum professor neste filtro.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          )
        else
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            ArenaProfessorRowCard(
              link: rows[i],
              now: now,
              onTap: () => _open(rows[i]),
            ),
          ],
        const SizedBox(height: 18),
        const ProfessorLinksNote(
          'Ser “Equipe da arena” não dá acesso ao financeiro, aos preços ou à '
          'administração. Só valem as permissões marcadas em cada vínculo.',
        ),
      ],
    );
  }

  /// "ARENA CFC · 4 ATIVOS" — curto para caber no cabeçalho do celular.
  String _subtitle(
    String arenaLabel,
    List<ArenaProfessorLink>? links,
    DateTime now,
  ) {
    if (links == null) return arenaLabel;
    if (links.isEmpty) return '$arenaLabel · sem professores';
    final kpis = arenaProfessorKpis(links, now);
    final active = kpis.staffActive + kpis.independentActive;
    return '$arenaLabel · $active ${active == 1 ? 'ativo' : 'ativos'}';
  }

  void _toggleType(ArenaProfessorTypeFilter type) {
    setState(() => _type = _type == type ? ArenaProfessorTypeFilter.all : type);
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.kpis});

  final ArenaProfessorKpis kpis;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      ArenaProfessorKpiTile(
        label: 'Equipe da arena',
        value: kpis.staffActive,
        sub: arenaProfessorActiveKpiSub(kpis.staffActive, kpis.staffSuspended),
      ),
      ArenaProfessorKpiTile(
        label: 'Independentes',
        value: kpis.independentActive,
        sub: arenaProfessorActiveKpiSub(
          kpis.independentActive,
          kpis.independentSuspended,
        ),
      ),
      ArenaProfessorKpiTile(
        label: 'Solicitações',
        value: kpis.pending,
        sub: kpis.pending > 0 ? 'aguardando sua decisão' : 'nenhuma agora',
        highlight: kpis.pending > 0,
      ),
      ArenaProfessorKpiTile(
        label: 'Convites enviados',
        value: kpis.invitesOpen,
        sub: arenaProfessorInviteKpiSub(kpis),
      ),
    ];
    return Column(
      children: [
        for (var row = 0; row < 2; row++) ...[
          if (row > 0) const SizedBox(height: 10),
          // Mesma altura nos dois: o rodapé pode quebrar em tela estreita.
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: tiles[row * 2]),
                const SizedBox(width: 10),
                Expanded(child: tiles[row * 2 + 1]),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// A6 · Nenhum professor ainda: convite, link da página e os dois tipos.
class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.canManage,
    required this.onInvite,
    required this.onCopyLink,
  });

  final bool canManage;
  final VoidCallback onInvite;
  final VoidCallback onCopyLink;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.3),
              ),
            ),
            child: const Icon(
              Icons.sports_rounded,
              size: 28,
              color: AppColors.brand,
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Adicione seu primeiro professor',
          textAlign: TextAlign.center,
          style: ProfessorLinksStyle.display(21, color: colors.onSurface),
        ),
        const SizedBox(height: 8),
        Text(
          'Convide professores da sua equipe ou libere independentes para '
          'usar a estrutura. Professores também podem pedir vínculo pela '
          'página da arena — os pedidos aparecem aqui.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(
            fontSize: 13.5,
            height: 1.55,
            color: ProfessorLinksStyle.mute(colors),
          ),
        ),
        const SizedBox(height: 22),
        if (canManage) ...[
          ProfessorLinksPrimaryButton(
            key: const Key('arena-professor-empty-invite'),
            label: 'Convidar professor',
            onPressed: onInvite,
          ),
          const SizedBox(height: 10),
        ],
        ProfessorLinksGhostButton(
          key: const Key('arena-professor-empty-copy'),
          label: 'Copiar link da página',
          onPressed: onCopyLink,
        ),
        const SizedBox(height: 26),
        for (final type in ArenaProfessorLinkType.values) ...[
          ArenaProfessorTypeOption(
            type: type,
            selected: false,
            selectable: false,
            onTap: null,
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}
