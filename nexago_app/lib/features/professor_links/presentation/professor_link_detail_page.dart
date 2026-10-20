import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/professor_links_providers.dart';
import '../domain/arena_professor_link.dart';
import '../domain/professor_link_rules.dart';
import '../domain/professor_links_repository.dart';
import 'widgets/professor_invite_sheet.dart';
import 'widgets/professor_link_dialogs.dart';
import 'widgets/professor_link_request_sheet.dart';
import 'widgets/professor_links_ui.dart';

/// M6 — detalhe do vínculo: tipo e status, permissões, histórico e a ação do
/// estado (responder convite, cancelar pedido, encerrar, pedir de novo).
class ProfessorLinkDetailPage extends ConsumerWidget {
  const ProfessorLinkDetailPage({super.key, required this.linkId});

  final String linkId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final linkAsync = ref.watch(professorLinkProvider(linkId));
    final link = linkAsync.valueOrNull;
    if (link != null) return _DetailView(link: link);
    final loading = linkAsync.isLoading && !linkAsync.hasError;
    return ProfessorLinksScaffold(
      title: 'Vínculo',
      body: loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            )
          : AppEmptyView(
              icon: Icons.link_off_rounded,
              title: 'Vínculo não encontrado',
              subtitle: 'Este link pode estar desatualizado ou o vínculo não é '
                  'desta conta.',
              actionLabel: 'Ver minhas arenas',
              onAction: () => context.goNamed(AppRouteNames.professorArenas),
            ),
    );
  }
}

class _DetailView extends ConsumerStatefulWidget {
  const _DetailView({required this.link});

  final ArenaProfessorLink link;

  @override
  ConsumerState<_DetailView> createState() => _DetailViewState();
}

class _DetailViewState extends ConsumerState<_DetailView> {
  bool _busy = false;

  Future<void> _run(
    Future<ProfessorLinkResult> Function(ProfessorLinksRepository repo) call,
    String success,
  ) async {
    setState(() => _busy = true);
    try {
      await call(ref.read(professorLinksRepositoryProvider));
      if (!mounted) return;
      showAppSnackBar(context, success);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível concluir agora. Tente de novo em instantes.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelRequest() async {
    final link = widget.link;
    final confirmed = await confirmCancelProfessorRequest(
      context,
      arenaName: link.arenaName,
    );
    if (!confirmed || !mounted) return;
    await _run((repo) => repo.cancelRequest(link.id), 'Solicitação cancelada.');
  }

  Future<void> _end() async {
    final link = widget.link;
    final answer = await confirmEndProfessorLink(
      context,
      arenaName: link.arenaName,
    );
    if (answer == null || !mounted) return;
    await _run(
      (repo) => repo.endLink(linkId: link.id, reason: answer.reason),
      'Vínculo encerrado.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final link = widget.link;
    final now = ref.watch(professorLinksClockProvider)();
    final viewerUid = ref.watch(professorLinksUidProvider);
    final status = effectiveProfessorLinkStatus(link, now);
    final note = professorLinkStatusNote(link, now);
    final permissionsNote = professorPermissionsNote(status);
    final events =
        ref.watch(professorLinkEventsProvider(link.id)).valueOrNull ??
            const <ArenaProfessorLinkEvent>[];
    final action = professorLinkAction(link, now);

    return ProfessorLinksScaffold(
      title: link.arenaName,
      subtitle: professorLinkHeaderSubtitle(link, now),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          ProfessorLinksCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ProfessorArenaMark(
                      name: link.arenaName,
                      logoUrl: link.arenaLogoUrl,
                      size: 46,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ProfessorLinkTypeTag(link.type, small: true),
                          const SizedBox(height: 6),
                          ProfessorLinkStatusLabel(status, small: true),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  [
                    professorLinkTypeDescription(link.type),
                    if (link.arenaCity != null) link.arenaCity!,
                  ].join(' · '),
                  style: AppTypography.bodyS.copyWith(
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: 12),
            ProfessorLinksNote(note.text, tone: _noteTone(note.tone)),
          ],
          const SizedBox(height: 22),
          ProfessorLinksKicker(
            status == ArenaProfessorLinkStatus.invited
                ? 'A arena libera'
                : 'Suas permissões',
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: ProfessorPermissionList(
              permissions: professorPermissionsToShow(link, now),
              dense: true,
            ),
          ),
          if (permissionsNote != null) ...[
            const SizedBox(height: 8),
            Text(
              permissionsNote,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
          if (events.isNotEmpty) ...[
            const SizedBox(height: 22),
            const ProfessorLinksKicker('Histórico'),
            const SizedBox(height: 12),
            ProfessorLinkTimeline(
              entries: [
                for (final event in events)
                  ProfessorLinkTimelineEntry(
                    title: professorLinkEventTitle(
                      event,
                      linkType: link.type,
                    ),
                    meta: professorLinkEventMeta(
                      event,
                      viewerUid: viewerUid,
                      now: now,
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 18),
          ..._actions(context, action, link),
        ],
      ),
    );
  }

  List<Widget> _actions(
    BuildContext context,
    ProfessorLinkAction action,
    ArenaProfessorLink link,
  ) {
    final arenaPage = Center(
      child: TextButton(
        key: const Key('professor-link-arena-page'),
        onPressed: () => context.pushNamed(
          AppRouteNames.arenaDetail,
          pathParameters: {'arenaId': link.arenaId},
        ),
        child: const Text('Ver página da arena'),
      ),
    );
    return switch (action) {
      ProfessorLinkAction.respondInvite => [
          ProfessorLinksPrimaryButton(
            key: const Key('professor-link-respond'),
            label: 'Ver convite',
            onPressed: () => showProfessorInviteSheet(context, link),
          ),
          const SizedBox(height: 6),
          arenaPage,
        ],
      ProfessorLinkAction.cancelRequest => [
          ProfessorLinksGhostButton(
            key: const Key('professor-link-cancel'),
            label: 'Cancelar solicitação',
            color: AppColors.live,
            loading: _busy,
            onPressed: _cancelRequest,
          ),
          const SizedBox(height: 6),
          arenaPage,
        ],
      ProfessorLinkAction.end => [
          const ProfessorLinksNote(
            'Encerrar aqui não afeta seus vínculos com outras arenas.',
          ),
          const SizedBox(height: 12),
          ProfessorLinksGhostButton(
            key: const Key('professor-link-end'),
            label: 'Encerrar vínculo',
            color: AppColors.live,
            height: 46,
            loading: _busy,
            onPressed: _end,
          ),
          const SizedBox(height: 6),
          arenaPage,
        ],
      ProfessorLinkAction.requestAgain => [
          ProfessorLinksGhostButton(
            key: const Key('professor-link-request-again'),
            label: 'Solicitar novo vínculo',
            onPressed: () => startProfessorLinkRequest(
              context,
              arenaId: link.arenaId,
              arenaName: link.arenaName,
              arenaLogoUrl: link.arenaLogoUrl,
            ),
          ),
          const SizedBox(height: 6),
          arenaPage,
        ],
    };
  }
}

ProfessorLinksNoteTone _noteTone(ProfessorLinkTone tone) => switch (tone) {
      ProfessorLinkTone.invited => ProfessorLinksNoteTone.blue,
      ProfessorLinkTone.pending => ProfessorLinksNoteTone.yellow,
      ProfessorLinkTone.danger => ProfessorLinksNoteTone.red,
      ProfessorLinkTone.active ||
      ProfessorLinkTone.muted =>
        ProfessorLinksNoteTone.neutral,
    };
