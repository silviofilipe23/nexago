import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../../core/ui/app_status_views.dart';
import '../../../messages/infrastructure/messages_repository.dart';
import '../../../messages/presentation/messages_widgets.dart';
import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/domain/professor_link_rules.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professionals/arena_professionals_logic.dart';
import '../../domain/professionals/arena_professionals_providers.dart';
import '../../domain/professionals/arena_professionals_repository.dart';
import 'widgets/arena_professional_dialogs.dart';
import 'widgets/arena_professional_flows.dart';
import 'widgets/arena_professional_suspend_sheet.dart';
import 'widgets/arena_professionals_ui.dart';

/// A4 · Detalhe do vínculo (lado da arena): ficha, ações do estado (analisar,
/// suspender, reativar, encerrar, cancelar/reenviar convite), permissões com
/// interruptor e o histórico imutável. O push `arena_professor_*` abre aqui.
/// "Conversar" abre o canal com o professor (D4) — só com o vínculo ativo.
class ArenaProfessionalDetailPage extends ConsumerWidget {
  const ArenaProfessionalDetailPage({super.key, required this.linkId});

  final String linkId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final linkAsync = ref.watch(arenaProfessionalLinkProvider(linkId));
    final link = linkAsync.valueOrNull;
    if (link != null) return _DetailView(link: link);
    final loading = linkAsync.isLoading && !linkAsync.hasError;
    return ProfessorLinksScaffold(
      title: 'Profissionais',
      onBack: () => popOrGo(context, AppRoutes.arenaProfessionals),
      body: loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : AppEmptyView(
              icon: Icons.link_off_rounded,
              title: 'Vínculo não encontrado',
              subtitle: 'Este vínculo não existe ou não é de uma arena que '
                  'você administra.',
              actionLabel: 'Ver profissionais',
              onAction: () => context.goNamed(AppRouteNames.arenaProfessionals),
            ),
    );
  }
}

typedef _Saving = ({
  ArenaProfessorPermissionKey key,
  bool value,
  bool inFlight
});

class _DetailView extends ConsumerStatefulWidget {
  const _DetailView({required this.link});

  final ArenaProfessorLink link;

  @override
  ConsumerState<_DetailView> createState() => _DetailViewState();
}

class _DetailViewState extends ConsumerState<_DetailView> {
  bool _busy = false;
  bool _opening = false;

  /// Interruptor em gravação: mostra o valor novo até o doc voltar já
  /// alterado — soltar na resposta da callable faria o toggle piscar de volta
  /// antes do snapshot chegar.
  _Saving? _saving;
  Timer? _echoTimer;
  String? _permError;

  @override
  void dispose() {
    _echoTimer?.cancel();
    super.dispose();
  }

  ArenaProfessionalsRepository get _repo =>
      ref.read(arenaProfessionalsRepositoryProvider);

  Future<void> _run(
    Future<ProfessorLinkResult> Function() action, {
    required String success,
    required String fallback,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    await runArenaProfessorAction(
      context,
      action,
      success: success,
      fallback: fallback,
    );
    if (mounted) setState(() => _busy = false);
  }

  /// Canal com o professor (D4): `openArenaChannel` (refaz a lista da
  /// gestão) e abre a conversa do lado da arena.
  Future<void> _converse(ArenaProfessorLink link) async {
    if (_opening) return;
    setState(() => _opening = true);
    await openConversationWith(
      context,
      () => ref.read(messagesRepositoryProvider).openArenaChannel(
            link.arenaId,
            professorUid: link.professorUserId,
          ),
      professorMode: false,
      arenaLinkId: link.id,
    );
    if (mounted) setState(() => _opening = false);
  }

  void _setBusy(bool busy) {
    if (mounted) setState(() => _busy = busy);
  }

  Future<void> _suspend(ArenaProfessorLink link) async {
    final done = await showArenaProfessorSuspendSheet(context, link: link);
    if (!done || !mounted) return;
    showAppSnackBar(
      context,
      'Vínculo com ${link.professorName} suspenso. O professor foi avisado.',
    );
  }

  Future<void> _reactivate(ArenaProfessorLink link) => _run(
        () => _repo.reactivate(link.id),
        success: 'Vínculo com ${link.professorName} reativado.',
        fallback: 'Não foi possível reativar o vínculo.',
      );

  Future<void> _end(ArenaProfessorLink link) async {
    final answer = await confirmEndArenaProfessorLink(
      context,
      professorName: link.professorName,
    );
    if (answer == null || !mounted) return;
    await _run(
      () => _repo.end(linkId: link.id, reason: answer.reason),
      success: 'Vínculo encerrado. O professor foi avisado.',
      fallback: 'Não foi possível encerrar o vínculo.',
    );
  }

  Future<void> _cancelInvite(ArenaProfessorLink link) async {
    final confirmed = await confirmCancelArenaProfessorInvite(
      context,
      professorName: link.professorName,
    );
    if (!confirmed || !mounted) return;
    await _run(
      () => _repo.cancelInvite(link.id),
      success: 'Convite cancelado.',
      fallback: 'Não foi possível cancelar o convite.',
    );
  }

  /// "Reenviar convite" = convidar de novo com o mesmo professor, tipo,
  /// permissões e mensagem; o servidor reabre o doc (`cycle` + 1).
  Future<void> _resend(ArenaProfessorLink link) => _run(
        () => _repo.invite(
          arenaId: link.arenaId,
          professorUserId: link.professorUserId,
          type: link.type,
          permissions:
              arenaProfessorPermissionsToSend(link.permissions, link.type),
          message: link.message,
        ),
        success: 'Convite reenviado para ${link.professorName}. Vale por mais '
            '$arenaProfessorInviteTtlDays dias.',
        fallback: 'Não foi possível reenviar o convite.',
      );

  Future<void> _editCourtDiscount(ArenaProfessorLink link) async {
    final choice = await askArenaProfessorCourtDiscount(
      context,
      professorName: link.professorName,
      current: link.courtDiscountPercent,
      currentStartTime: link.courtDiscountStartTime,
      currentEndTime: link.courtDiscountEndTime,
    );
    if (choice == null || !mounted) return;
    final unchanged = choice.percent == link.courtDiscountPercent &&
        (choice.percent == 0 ||
            (choice.startTime == link.courtDiscountStartTime &&
                choice.endTime == link.courtDiscountEndTime));
    if (unchanged) return;
    await _run(
      () => _repo.updateCourtDiscount(
        linkId: link.id,
        courtDiscountPercent: choice.percent,
        courtDiscountStartTime: choice.startTime,
        courtDiscountEndTime: choice.endTime,
      ),
      success: arenaProfessorCourtDiscountSavedMessage(
        choice.percent,
        startTime: choice.startTime,
        endTime: choice.endTime,
      ),
      fallback: 'Não foi possível salvar o desconto.',
    );
  }

  Future<void> _togglePermission(
    ArenaProfessorLink link,
    ArenaProfessorPermissionKey key,
    bool value,
  ) async {
    _echoTimer?.cancel();
    setState(() {
      _saving = (key: key, value: value, inFlight: true);
      _permError = null;
    });
    try {
      await _repo.updatePermission(linkId: link.id, key: key, value: value);
      if (!mounted) return;
      setState(() => _saving = (key: key, value: value, inFlight: false));
      // Rede de segurança: sem o snapshot (listener caiu), não trava o toggle.
      _echoTimer = Timer(const Duration(seconds: 4), () {
        if (mounted) setState(() => _saving = null);
      });
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = null;
        _permError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = null;
        _permError = 'Não foi possível alterar a permissão.';
      });
    }
  }

  /// O doc já trouxe o valor gravado: solta o interruptor.
  _Saving? _pendingSaving(ArenaProfessorLink link) {
    final saving = _saving;
    if (saving == null || saving.inFlight) return saving;
    if (link.permissions.valueOf(saving.key) != saving.value) return saving;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _saving != saving) return;
      _echoTimer?.cancel();
      setState(() => _saving = null);
    });
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final link = widget.link;
    final now = ref.watch(arenaProfessionalsClockProvider)();
    final canManage = ref
        .watch(arenaProfessionalsManagedArenaIdsProvider)
        .contains(link.arenaId);
    final status = effectiveProfessorLinkStatus(link, now);
    final actions = canManage
        ? arenaProfessorActions(link, now)
        : const <ArenaProfessorAction>[];
    final events =
        ref.watch(arenaProfessionalEventsProvider(link.id)).valueOrNull ??
            const <ArenaProfessorLinkEvent>[];
    final saving = _pendingSaving(link);
    var permissions = arenaProfessorPermissionsShown(link, now);
    if (saving != null) {
      permissions =
          arenaProfessorPermissionsWith(permissions, saving.key, saving.value);
    }
    final editable = canManage &&
        arenaProfessorPermissionsEditable(status) &&
        saving == null;
    final permissionsNote = arenaProfessorPermissionsNote(link, now);
    final discountEditable = arenaProfessorCourtDiscountEditable(status);
    final showDiscount = discountEditable || link.courtDiscountPercent > 0;

    return ProfessorLinksScaffold(
      title: link.professorName,
      subtitle: arenaProfessorDetailSubtitle(link, now).toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.arenaProfessionals),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          _ProfileCard(link: link, status: status),
          if (canManage) ...[
            const SizedBox(height: 14),
            ProfessorLinksGhostButton(
              key: const Key('arena-professor-converse'),
              label: 'Conversar',
              height: 46,
              loading: _opening,
              onPressed: status == ArenaProfessorLinkStatus.active
                  ? () => _converse(link)
                  : null,
            ),
            if (status != ArenaProfessorLinkStatus.active) ...[
              const SizedBox(height: 8),
              Text(
                'O canal com o professor abre com o vínculo ativo.',
                key: const Key('arena-professor-converse-hint'),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 14),
            _Actions(
              actions: actions,
              busy: _busy,
              onAnalyze: () => analyzeArenaProfessorRequestFlow(
                context,
                ref,
                link,
                onBusy: _setBusy,
              ),
              onSuspend: () => _suspend(link),
              onReactivate: () => _reactivate(link),
              onEnd: () => _end(link),
              onCancelInvite: () => _cancelInvite(link),
              onResend: () => _resend(link),
            ),
          ],
          const SizedBox(height: 24),
          const ArenaProfessorSectionHead(
            title: 'Permissões neste vínculo',
            hint: 'Alterações ficam no histórico',
          ),
          const SizedBox(height: 8),
          ArenaProfessorPermissionToggles(
            type: link.type,
            permissions: permissions,
            busyKey: saving != null && saving.inFlight ? saving.key : null,
            onChanged: editable
                ? (key, value) => _togglePermission(link, key, value)
                : null,
          ),
          if (_permError != null) ...[
            const SizedBox(height: 8),
            ArenaProfessorErrorBanner(_permError!),
          ],
          if (permissionsNote != null) ...[
            const SizedBox(height: 10),
            ProfessorLinksNote(
              permissionsNote,
              tone: ProfessorLinksNoteTone.yellow,
            ),
          ],
          const SizedBox(height: 10),
          const ProfessorLinksNote(
            'Sem acesso a financeiro, preços ou administração da arena — '
            'independentemente do tipo de vínculo.',
          ),
          if (showDiscount) ...[
            const SizedBox(height: 24),
            const ArenaProfessorSectionHead(
              title: 'Desconto no aluguel de quadra',
              hint: 'Reserva como professor',
            ),
            const SizedBox(height: 8),
            _CourtDiscountCard(
              percent: link.courtDiscountPercent,
              startTime: link.courtDiscountStartTime,
              endTime: link.courtDiscountEndTime,
              busy: _busy,
              onEdit: canManage && discountEditable
                  ? () => _editCourtDiscount(link)
                  : null,
            ),
            const SizedBox(height: 10),
            const ProfessorLinksNote(
              'Vale quando o professor reserva quadra “como professor”, sobre '
              'o preço cheio de cada horário. Não soma com promoção ou cupom: '
              'vale o menor preço. Só os horários inteiros dentro da faixa '
              'têm desconto.',
            ),
          ],
          const SizedBox(height: 24),
          const ArenaProfessorSectionHead(
              title: 'Histórico', hint: 'Eventos imutáveis'),
          const SizedBox(height: 12),
          if (events.isEmpty)
            Text(
              'Sem eventos registrados ainda.',
              style: AppTypography.bodyS.copyWith(
                color: ProfessorLinksStyle.dim(colors),
              ),
            )
          else
            ProfessorLinkTimeline(
              entries: [
                for (final event in events)
                  ProfessorLinkTimelineEntry(
                    title: arenaProfessorEventTitle(event, link),
                    meta: arenaProfessorEventMeta(event, now),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.link, required this.status});

  final ArenaProfessorLink link;
  final ArenaProfessorLinkStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reason = arenaProfessorReasonFact(link);
    final message = link.message;
    final byArena = link.initiatedBy == ArenaProfessorSide.arena;
    final approvedBy = link.approvedByName;
    final invitedBy = link.invitedByName;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ArenaProfessorAvatar(
                name: link.professorName,
                photoUrl: link.professorPhotoUrl,
                size: 56,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      link.professorName,
                      style: ProfessorLinksStyle.display(
                        18,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      arenaProfessorModalitiesLabel(link),
                      style: AppTypography.bodyS.copyWith(
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ArenaProfessorFact(
            label: 'Tipo',
            child: ProfessorLinkTypeTag(link.type, small: true),
          ),
          ArenaProfessorFact(
            label: 'Status',
            child: ArenaProfessorStatusLabel(status),
          ),
          ArenaProfessorFact(
            label: 'Iniciado por',
            child: ArenaProfessorFactText(byArena ? 'Arena' : 'Professor'),
          ),
          if (approvedBy != null)
            ArenaProfessorFact(
              label: 'Aprovado por',
              child: ArenaProfessorFactText(approvedBy),
            )
          else if (invitedBy != null)
            ArenaProfessorFact(
              label: 'Convidado por',
              child: ArenaProfessorFactText(invitedBy),
            ),
          if (reason != null) _Block(label: reason.label, text: reason.text),
          if (message != null)
            _Block(
              label: byArena ? 'Mensagem do convite' : 'Mensagem do pedido',
              text: '“$message”',
            ),
        ],
      ),
    );
  }
}

/// Valor atual do desconto e o "Alterar" (só quem administra, com o vínculo
/// ativo ou suspenso).
class _CourtDiscountCard extends StatelessWidget {
  const _CourtDiscountCard({
    required this.percent,
    required this.startTime,
    required this.endTime,
    required this.busy,
    required this.onEdit,
  });

  final int percent;
  final String? startTime;
  final String? endTime;
  final bool busy;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('arena-professor-court-discount'),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  arenaProfessorCourtDiscountValueLabel(percent),
                  key: const Key('arena-professor-court-discount-value'),
                  style: ProfessorLinksStyle.display(
                    18,
                    color: percent > 0
                        ? colors.onSurface
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  arenaProfessorCourtDiscountWindowLabel(
                    percent,
                    startTime: startTime,
                    endTime: endTime,
                  ),
                  key: const Key('arena-professor-court-discount-window-label'),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (onEdit != null)
            SizedBox(
              width: 110,
              child: ProfessorLinksGhostButton(
                key: const Key('arena-professor-court-discount-edit'),
                label: 'Alterar',
                height: 40,
                onPressed: busy ? null : onEdit,
              ),
            ),
        ],
      ),
    );
  }
}

/// Bloco "rótulo em cima, texto embaixo" (motivo, mensagem).
class _Block extends StatelessWidget {
  const _Block({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfessorLinksKicker(label),
          const SizedBox(height: 6),
          Text(
            text,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              height: 1.5,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

/// Botões do estado: os principais (laranja) ocupam a linha; os secundários
/// dividem a linha de baixo.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.actions,
    required this.busy,
    required this.onAnalyze,
    required this.onSuspend,
    required this.onReactivate,
    required this.onEnd,
    required this.onCancelInvite,
    required this.onResend,
  });

  final List<ArenaProfessorAction> actions;
  final bool busy;
  final VoidCallback onAnalyze;
  final VoidCallback onSuspend;
  final VoidCallback onReactivate;
  final VoidCallback onEnd;
  final VoidCallback onCancelInvite;
  final VoidCallback onResend;

  @override
  Widget build(BuildContext context) {
    final primary = <Widget>[];
    final secondary = <Widget>[];
    for (final action in actions) {
      switch (action) {
        case ArenaProfessorAction.analyze:
          primary.add(ProfessorLinksPrimaryButton(
            key: const Key('arena-professor-action-analyze'),
            label: 'Analisar solicitação',
            loading: busy,
            onPressed: onAnalyze,
          ));
        case ArenaProfessorAction.reactivate:
          primary.add(ProfessorLinksPrimaryButton(
            key: const Key('arena-professor-action-reactivate'),
            label: 'Reativar vínculo',
            loading: busy,
            onPressed: onReactivate,
          ));
        case ArenaProfessorAction.resendInvite:
          primary.add(ProfessorLinksPrimaryButton(
            key: const Key('arena-professor-action-resend'),
            label: 'Reenviar convite',
            loading: busy,
            onPressed: onResend,
          ));
        case ArenaProfessorAction.suspend:
          secondary.add(ProfessorLinksGhostButton(
            key: const Key('arena-professor-action-suspend'),
            label: 'Suspender',
            height: 46,
            onPressed: busy ? null : onSuspend,
          ));
        case ArenaProfessorAction.end:
          secondary.add(ProfessorLinksGhostButton(
            key: const Key('arena-professor-action-end'),
            label: 'Encerrar vínculo',
            color: context.themeColors.live,
            height: 46,
            onPressed: busy ? null : onEnd,
          ));
        case ArenaProfessorAction.cancelInvite:
          secondary.add(ProfessorLinksGhostButton(
            key: const Key('arena-professor-action-cancel'),
            label: 'Cancelar convite',
            color: context.themeColors.live,
            height: 46,
            onPressed: busy ? null : onCancelInvite,
          ));
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final button in primary) ...[
          button,
          const SizedBox(height: 10),
        ],
        if (secondary.isNotEmpty)
          Row(
            children: [
              for (var i = 0; i < secondary.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: secondary[i]),
              ],
            ],
          ),
      ],
    );
  }
}
