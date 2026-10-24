import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete_training/domain/center_enrollment_request.dart'
    show centerShortDay;
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_exit_requests.dart';
import '../infrastructure/firebase_center_exit_requests_repository.dart';
import 'widgets/center_management_widgets.dart';
import 'widgets/center_mode_tab_scope.dart';

/// Abre o detalhe do pedido (T11).
void openCenterExitRequest(
  BuildContext context,
  String centerId,
  String requestId,
) =>
    context.pushNamed(
      AppRouteNames.centerCoachExitRequest,
      pathParameters: {'centerId': centerId, 'requestId': requestId},
    );

Color _toneColor(CenterExitTone t) => switch (t) {
      CenterExitTone.attention => AppColors.pending,
      CenterExitTone.info => ProfessorLinksStyle.blue,
      CenterExitTone.danger => AppColors.live,
      CenterExitTone.success => AppColors.win,
      CenterExitTone.neutral => const Color(0xFF8A8A8F),
    };

/// Trancar e cancelar (gestão): atestados a revisar, pausas e cancelamentos
/// em andamento e os encerrados. A recepção vê; owner/admin decidem no
/// detalhe.
class CenterCoachExitRequestsPage extends ConsumerWidget {
  const CenterCoachExitRequestsPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final member = ref.watch(centerMembershipProvider(centerId));
    final allowed = member != null && member.has('view_enrollments');
    final async = ref.watch(centerExitRequestsProvider(centerId));
    final groups = centerExitGroups(async.valueOrNull ?? const []);

    Widget section(String title, List<CenterExitRequest> list) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 14),
            ProfessorLinksKicker('$title · ${list.length}'),
            const SizedBox(height: 8),
            ProfessorLinksCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final (i, r) in list.indexed)
                    _RequestRow(
                      key: Key('center-exit-row-${r.id}'),
                      request: r,
                      first: i == 0,
                      onTap: () =>
                          openCenterExitRequest(context, centerId, r.id),
                    ),
                ],
              ),
            ),
          ],
        );

    return ProfessorLinksScaffold(
      title: 'Trancar e cancelar',
      subtitle: member?.centerName.toUpperCase(),
      showBack: !CenterModeTabScope.of(context),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (!allowed)
            const ProfessorLinksCard(
              key: Key('center-exit-no-access'),
              child: ProfessorMutedText(
                'Os pedidos ficam com quem acompanha as matrículas do centro.',
              ),
            )
          else if (async.isLoading && async.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (async.hasError && async.valueOrNull == null)
            ProfessorRetryCard(
              message: 'Não foi possível carregar os pedidos.',
              onRetry: () =>
                  ref.invalidate(centerExitRequestsProvider(centerId)),
            )
          else if (groups.review.isEmpty &&
              groups.open.isEmpty &&
              groups.closed.isEmpty)
            const ProfessorLinksCard(
              key: Key('center-exit-empty'),
              child: ProfessorMutedText(
                'Nenhum pedido de trancamento, pausa por lesão ou '
                'cancelamento. Os alunos pedem pelo app.',
              ),
            )
          else ...[
            if (!member.isManager)
              const ProfessorLinksNote(
                'Só owner ou admin aprovam ou recusam os pedidos.',
                tone: ProfessorLinksNoteTone.blue,
              ),
            if (groups.review.isNotEmpty) section('A revisar', groups.review),
            if (groups.open.isNotEmpty) section('Em andamento', groups.open),
            if (groups.closed.isNotEmpty)
              section('Encerrados', groups.closed.take(30).toList()),
          ],
        ],
      ),
    );
  }
}

class _RequestRow extends StatelessWidget {
  const _RequestRow({
    super.key,
    required this.request,
    required this.first,
    required this.onTap,
  });

  final CenterExitRequest request;
  final bool first;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = request;
    final st = centerExitStatusOf(r);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors))),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.studentName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      r.typeLabel,
                      if (r.className.isNotEmpty) r.className,
                      if (r.periodLabel.isNotEmpty) r.periodLabel,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              st.label.toUpperCase(),
              style: ProfessorLinksStyle.mono(
                9.5,
                color: colors.readableTone(_toneColor(st.tone)),
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      ),
    );
  }
}

/// T11 · Pedido do aluno: atestado (foto ampliável ou PDF fora do app), os
/// dados e as decisões. "Pedir outro doc." e "Recusar" pedem o recado ao
/// aluno; "Desfazer" vale para o pedido agendado. Na pausa por lesão em curso
/// com alta exigida, o bloco "Alta médica" aprova a alta (ou libera sem ela).
class CenterCoachExitRequestPage extends ConsumerStatefulWidget {
  const CenterCoachExitRequestPage({
    super.key,
    required this.centerId,
    required this.requestId,
  });

  final String centerId;
  final String requestId;

  @override
  ConsumerState<CenterCoachExitRequestPage> createState() =>
      _CenterCoachExitRequestPageState();
}

class _CenterCoachExitRequestPageState
    extends ConsumerState<CenterCoachExitRequestPage> {
  String? _busy;

  Future<void> _decide(CenterExitRequest r, String decision) async {
    var note = '';
    if (decision != 'approve') {
      // `clear` confirma com recado opcional; os outros pedem o recado.
      final text = await showProfessorLinksSheet<String>(
        context,
        builder: (_) => _NoteSheet(decision: decision, request: r),
      );
      if (text == null || !mounted) return;
      note = text;
    }
    setState(() => _busy = decision);
    try {
      final status =
          await ref.read(centerExitRequestsRepositoryProvider).decide(
                centerId: widget.centerId,
                requestId: r.id,
                decision: decision,
                note: note,
              );
      if (!mounted) return;
      showCenterError(
          context,
          switch (decision) {
            'approve' => status == 'active'
                ? 'Pausa aprovada. A matrícula já está pausada.'
                : 'Pausa aprovada. Começa no dia pedido.',
            'reject' => 'Pedido recusado. O aluno recebe o aviso.',
            'needs_document' => 'Pedimos outro documento ao aluno.',
            'clear' => status == 'done'
                ? 'Volta liberada. As aulas voltam a partir de hoje.'
                : 'Volta liberada. O aluno volta na data marcada.',
            _ => 'Pedido desfeito. A matrícula segue normal.',
          });
    } on CenterCoachException catch (e) {
      if (mounted) showCenterError(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final member = ref.watch(centerMembershipProvider(widget.centerId));
    final async = ref.watch(centerExitRequestsProvider(widget.centerId));
    CenterExitRequest? r;
    for (final x in async.valueOrNull ?? const <CenterExitRequest>[]) {
      if (x.id == widget.requestId) r = x;
    }
    final manager = member?.isManager ?? false;

    return ProfessorLinksScaffold(
      title: r?.typeLabel ?? 'Pedido',
      subtitle: r == null
          ? null
          : [
              r.studentName,
              if (r.className.isNotEmpty) r.className,
            ].join(' · ').toUpperCase(),
      onBack: () => popOrGo(
        context,
        AppRoutes.centerCoachExitRequests.replaceFirst(
          ':centerId',
          widget.centerId,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (member == null || !member.has('view_enrollments'))
            const ProfessorLinksCard(
              child: ProfessorMutedText('Sem acesso aos pedidos deste centro.'),
            )
          else if (async.isLoading && async.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (r == null)
            const ProfessorLinksCard(
              key: Key('center-exit-missing'),
              child: ProfessorMutedText('Pedido não encontrado.'),
            )
          else ...[
            _StatusHeader(request: r),
            if (r.certificate != null) ...[
              const SizedBox(height: 12),
              if (manager)
                _CertificatePreview(certificate: r.certificate!)
              else
                const ProfessorLinksNote(
                  'Só owner ou admin do centro vê o atestado.',
                ),
            ],
            if (centerExitClearanceLabel(r) case final label?) ...[
              const SizedBox(height: 12),
              _ClearanceBlock(
                request: r,
                label: label,
                manager: manager,
              ),
            ],
            const SizedBox(height: 12),
            CenterInfoRows(rows: _rows(r)),
            if (r.comment.isNotEmpty) ...[
              const SizedBox(height: 12),
              ProfessorLinksNote('Comentário do aluno: ${r.comment}'),
            ],
            if (r.decisionNote.isNotEmpty) ...[
              const SizedBox(height: 12),
              ProfessorLinksNote(
                'Recado ao aluno'
                '${r.decidedByName.isEmpty ? '' : ' (${r.decidedByName})'}: '
                '${r.decisionNote}',
                tone: ProfessorLinksNoteTone.yellow,
              ),
            ],
            if (r.overLimit && r.awaitsReview) ...[
              const SizedBox(height: 12),
              const ProfessorLinksNote(
                'Afastamento acima do limite do centro: decida caso a caso.',
                tone: ProfessorLinksNoteTone.yellow,
              ),
            ],
            const SizedBox(height: 16),
            ..._actions(r, manager),
          ],
        ],
      ),
    );
  }

  List<(String, String)> _rows(CenterExitRequest r) {
    final c = r.certificate;
    return [
      if (c?.issuedOn != null) ('Emitido', centerShortDay(c!.issuedOn!)),
      if (r.days != null)
        ('Afastamento', '${r.days} dia${r.days == 1 ? '' : 's'}'),
      if (r.reasonLabel.isNotEmpty) ('Motivo', r.reasonLabel),
      if (!r.isCancel && r.periodLabel.isNotEmpty) ('Pausa', r.periodLabel),
      if (!r.isCancel && r.pausedUntil != null)
        ('Volta em', centerShortDay(r.pausedUntil!)),
      if (!r.isCancel) ('Cobrança', 'Suspensa na pausa'),
      if (r.isCancel && r.lastDay != null)
        ('Último dia', centerShortDay(r.lastDay!)),
      if (r.retainedDiscountPercent != null)
        (
          'Ficou com',
          [
            '${r.retainedDiscountPercent}% de desconto',
            if (r.effectiveFrom != null)
              'mensalidade de ${centerShortDay(r.effectiveFrom!)}',
          ].join(' · '),
        ),
      if (r.retainedPlanName != null)
        (
          'Ficou com',
          [
            r.retainedPlanName!,
            if (r.effectiveFrom != null)
              'a partir de ${centerShortDay(r.effectiveFrom!)}',
          ].join(' · '),
        ),
      if (r.planName.isNotEmpty)
        (
          'Plano',
          '${r.planName} · ${formatBRLFromCents(r.priceCents)}'
              '${r.planType == 'monthly' ? '/mês' : ''}',
        ),
      if (r.createdAt != null)
        (
          'Pedido em',
          '${centerShortDay(nexagoEventDayKey(r.createdAt!))} · '
              '${r.source == 'desk' ? 'balcão' : 'app'}',
        ),
      if (r.decidedByName.isNotEmpty && !r.awaitsReview)
        ('Decidido por', r.decidedByName),
    ];
  }

  List<Widget> _actions(CenterExitRequest r, bool manager) {
    final a = centerExitActions(r);
    if (!a.approve && !a.reject && !a.askDocument && !a.undo && !a.clear) {
      return const [];
    }
    if (!manager) {
      return const [
        ProfessorLinksNote(
          'Só owner ou admin decidem este pedido.',
          tone: ProfessorLinksNoteTone.blue,
        ),
      ];
    }
    final busy = _busy != null;
    return [
      if (a.approve)
        ProfessorLinksPrimaryButton(
          key: const Key('center-exit-approve'),
          label: 'Aprovar pausa',
          loading: _busy == 'approve',
          onPressed: busy ? null : () => _decide(r, 'approve'),
        ),
      if (a.askDocument || a.reject) ...[
        const SizedBox(height: 8),
        Row(
          children: [
            if (a.askDocument) ...[
              Expanded(
                child: ProfessorLinksGhostButton(
                  key: const Key('center-exit-ask-document'),
                  label: 'Pedir outro doc.',
                  height: 44,
                  loading: _busy == 'needs_document',
                  onPressed: busy ? null : () => _decide(r, 'needs_document'),
                ),
              ),
              const SizedBox(width: 8),
            ],
            if (a.reject)
              Expanded(
                child: ProfessorLinksGhostButton(
                  key: const Key('center-exit-reject'),
                  label: 'Recusar',
                  color: AppColors.live,
                  height: 44,
                  loading: _busy == 'reject',
                  onPressed: busy ? null : () => _decide(r, 'reject'),
                ),
              ),
          ],
        ),
      ],
      if (a.undo)
        ProfessorLinksGhostButton(
          key: const Key('center-exit-undo'),
          label: r.isCancel ? 'Desfazer cancelamento' : 'Desfazer pausa',
          height: 44,
          loading: _busy == 'undo',
          onPressed: busy ? null : () => _decide(r, 'undo'),
        ),
      if (a.clear)
        r.clearanceStatus == 'submitted'
            ? ProfessorLinksPrimaryButton(
                key: const Key('center-exit-clear'),
                label: 'Aprovar alta',
                loading: _busy == 'clear',
                onPressed: busy ? null : () => _decide(r, 'clear'),
              )
            : ProfessorLinksGhostButton(
                key: const Key('center-exit-clear'),
                label: 'Liberar sem alta',
                height: 44,
                loading: _busy == 'clear',
                onPressed: busy ? null : () => _decide(r, 'clear'),
              ),
    ];
  }
}

/// Alta médica da pausa por lesão: situação, aviso da volta segurada e o
/// arquivo (só owner/admin abre, como o atestado).
class _ClearanceBlock extends StatelessWidget {
  const _ClearanceBlock({
    required this.request,
    required this.label,
    required this.manager,
  });

  final CenterExitRequest request;
  final String label;
  final bool manager;

  @override
  Widget build(BuildContext context) {
    final r = request;
    final c = r.clearance;
    return Column(
      key: const Key('center-exit-clearance'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Alta médica'),
        const SizedBox(height: 8),
        if (r.awaitingClearance && r.clearanceOpen) ...[
          const ProfessorLinksNote(
            'A pausa terminou e a volta espera a alta. Segue pausada, sem '
            'cobrança, até a gestão liberar.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
          const SizedBox(height: 8),
        ],
        if (c != null) ...[
          if (manager)
            _CertificatePreview(certificate: c, clearance: true)
          else
            const ProfessorLinksNote(
              'Só owner ou admin do centro vê a alta.',
            ),
          const SizedBox(height: 8),
        ],
        CenterInfoRows(
          rows: [
            ('Situação', label),
            if (c?.issuedOn != null) ('Emitida', centerShortDay(c!.issuedOn!)),
            if (r.clearanceStatus == 'approved' &&
                r.clearanceDecidedByName.isNotEmpty)
              ('Liberada por', r.clearanceDecidedByName),
            if (r.clearanceNote.isNotEmpty) ('Recado', r.clearanceNote),
          ],
        ),
      ],
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.request});

  final CenterExitRequest request;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final st = centerExitStatusOf(request);
    final tone = _toneColor(st.tone);
    return ProfessorLinksCard(
      key: const Key('center-exit-status'),
      borderColor: tone.withValues(alpha: 0.35),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ProfessorLinksKicker(
                  st.label,
                  color: colors.readableTone(tone),
                ),
                const SizedBox(height: 6),
                Text(
                  request.studentName,
                  style: ProfessorLinksStyle.display(
                    17,
                    color: colors.onSurface,
                  ),
                ),
                if (request.periodLabel.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    request.periodLabel,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Atestado: foto (toque para ampliar) ou PDF (abre fora do app).
class _CertificatePreview extends ConsumerWidget {
  const _CertificatePreview({
    required this.certificate,
    this.clearance = false,
  });

  final CenterExitCertificate certificate;

  /// Alta médica em vez do atestado (outra chave e outros textos).
  final bool clearance;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final c = certificate;
    final url = ref.watch(centerExitCertificateUrlProvider(c.path));
    final link = url.valueOrNull;
    final key = Key(
      clearance ? 'center-exit-clearance-file' : 'center-exit-certificate',
    );
    final noun = clearance ? 'a alta' : 'o atestado';

    if (c.isImage) {
      return ProfessorLinksCard(
        key: key,
        padding: EdgeInsets.zero,
        onTap: link == null
            ? null
            : () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    fullscreenDialog: true,
                    builder: (_) => _CertificateViewer(
                      url: link,
                      title: clearance ? 'Alta médica' : 'Atestado',
                    ),
                  ),
                ),
        child: SizedBox(
          height: 230,
          child: link != null
              ? Image.network(
                  link,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  errorBuilder: (_, _, _) => _placeholder(
                    colors,
                    'Não foi possível carregar a foto',
                  ),
                )
              : _placeholder(
                  colors,
                  url.hasError
                      ? (url.error is CenterCoachException
                          ? (url.error as CenterCoachException).message
                          : 'Não foi possível abrir $noun')
                      : 'Carregando ${clearance ? 'alta' : 'atestado'}…',
                ),
        ),
      );
    }
    return ProfessorLinksCard(
      key: key,
      onTap: link == null ? null : () => openExternalUrl(link),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Icon(
            Icons.picture_as_pdf_outlined,
            size: 28,
            color: colors.readableTone(AppColors.live),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.fileName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  url.hasError
                      ? 'Não foi possível abrir $noun'
                      : 'PDF · ${c.sizeLabel} · toque para abrir',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.open_in_new_rounded,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }

  Widget _placeholder(AppThemeColors colors, String text) => Center(
        child: Text(
          text.toUpperCase(),
          textAlign: TextAlign.center,
          style: ProfessorLinksStyle.mono(10,
              color: ProfessorLinksStyle.dim(colors)),
        ),
      );
}

class _CertificateViewer extends StatelessWidget {
  const _CertificateViewer({required this.url, this.title = 'Atestado'});

  final String url;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text(title),
        ),
        body: InteractiveViewer(
          maxScale: 5,
          child: Center(child: Image.network(url, fit: BoxFit.contain)),
        ),
      );
}

/// Recado ao aluno (recusar, pedir outro documento, desfazer, liberar a
/// volta).
class _NoteSheet extends StatefulWidget {
  const _NoteSheet({required this.decision, required this.request});

  final String decision;
  final CenterExitRequest request;

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  bool get _required => widget.decision != 'undo' && widget.decision != 'clear';

  @override
  Widget build(BuildContext context) {
    final (title, hint, cta) = switch (widget.decision) {
      'reject' => (
          'Recusar pedido',
          'Explique ao aluno por que não foi aprovado',
          'Recusar',
        ),
      'needs_document' => (
          'Pedir outro documento',
          'Ex.: o atestado precisa ter data e dias de afastamento',
          'Pedir documento',
        ),
      'clear' when widget.request.clearanceStatus == 'submitted' => (
          'Aprovar alta',
          'Recado ao aluno (opcional)',
          'Aprovar alta',
        ),
      'clear' => (
          'Liberar sem alta',
          'Recado ao aluno (opcional)',
          'Liberar volta',
        ),
      _ => (
          widget.request.isCancel ? 'Desfazer cancelamento' : 'Desfazer pausa',
          'Recado ao aluno (opcional)',
          'Desfazer',
        ),
    };
    return ProfessorLinksSheetBody(
      key: const Key('center-exit-note-sheet'),
      title: title,
      subtitle: '${widget.request.studentName} recebe o recado no app.',
      children: [
        CenterTextField(
          key: const Key('center-exit-note'),
          controller: _note,
          hint: hint,
          lines: 3,
          onChanged: (_) => setState(() {}),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-exit-note-send'),
          label: cta,
          onPressed: _required && _note.text.trim().isEmpty
              ? null
              : () => Navigator.of(context).pop(_note.text.trim()),
        ),
      ],
    );
  }
}
