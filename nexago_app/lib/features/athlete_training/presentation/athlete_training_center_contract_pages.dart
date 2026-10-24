import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/center_contract.dart';
import '../domain/training_center.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/training_centers_repository.dart';
import 'widgets/center_contract_widgets.dart';
import 'widgets/training_widgets.dart' show TrainingSectionTitle;

/// Contratos do aluno no centro (canvas "Contratos dos alunos", K6–K9):
/// lista, leitura até o fim, aceite explícito e confirmação. Assinatura
/// eletrônica simples: conta NexaGO autenticada + aceite + leitura + as
/// evidências que o servidor grava. Sem código por SMS e sem PDF no app.

// ── navegação ────────────────────────────────────────────────────────────

String _centerPath(String centerId) => AppRoutes.athleteTrainingCenter
    .replaceFirst(':centerId', Uri.encodeComponent(centerId));

void openCenterContracts(BuildContext context, String centerId) =>
    context.pushNamed(
      AppRouteNames.athleteTrainingCenterContracts,
      pathParameters: {'centerId': centerId},
    );

void openCenterContract(
  BuildContext context,
  String centerId,
  String contractId,
) =>
    context.pushNamed(
      AppRouteNames.athleteTrainingCenterContract,
      pathParameters: {'centerId': centerId, 'contractId': contractId},
    );

/// O contrato a destacar: o primeiro aberto obrigatório, senão o primeiro
/// aberto.
MyCenterContract? featuredOpenContract(TrainingCenterLink center) {
  final open = center.openContracts;
  if (open.isEmpty) return null;
  for (final c in open) {
    if (!c.optional) return c;
  }
  return open.first;
}

String _signedDay(MyCenterContract c) =>
    c.signedAt == null ? '' : nexagoEventDayKey(c.signedAt!);

String _docTitle(MyCenterContract c) =>
    c.isEnrollment ? 'Contrato de matrícula' : c.title;

String _openPitch(MyCenterContract c) => c.requireBeforePayment
    ? 'Assine para liberar o pagamento e garantir sua vaga. Leva cerca de 2 '
        'minutos.'
    : c.optional
        ? 'Termo opcional: você pode autorizar ou recusar. Leva cerca de 1 minuto.'
        : 'Leia e assine pelo app. Leva cerca de 2 minutos.';

/// Carregando / centro sumiu / contrato sumiu, iguais nas quatro telas.
Widget? _guard(
  AsyncValue<TrainingCenterLink?> async, {
  required bool missing,
  required String missingText,
}) {
  if (async.isLoading && async.valueOrNull == null) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
    );
  }
  if (missing) {
    return ProfessorLinksCard(
      key: const Key('center-contract-missing'),
      child: ProfessorMutedText(missingText),
    );
  }
  return null;
}

/// Rodapé fixo das telas (botão principal + respiro do gesto).
class _Footer extends StatelessWidget {
  const _Footer({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        12 + MediaQuery.paddingOf(context).bottom,
      ),
      decoration: BoxDecoration(
        color: colors.canvas,
        border:
            Border(top: BorderSide(color: ProfessorLinksStyle.line(colors))),
      ),
      child: child,
    );
  }
}

// ── entrada na tela do centro ────────────────────────────────────────────

/// Card dos contratos na tela do centro: destaque laranja quando há documento
/// para assinar; senão, uma linha para a lista.
class CenterContractsEntry extends StatelessWidget {
  const CenterContractsEntry({super.key, required this.center});

  final TrainingCenterLink center;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final featured = featuredOpenContract(center);
    final openCount = center.openContracts.length;
    if (featured == null) {
      return ProfessorLinksCard(
        key: const Key('training-center-contracts'),
        onTap: () => openCenterContracts(context, center.centerId),
        padding: const EdgeInsets.all(13),
        child: Row(
          children: [
            Icon(
              Icons.description_outlined,
              size: 20,
              color: ProfessorLinksStyle.mute(colors),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                center.contracts.length == 1
                    ? 'Contratos · 1 documento'
                    : 'Contratos · ${center.contracts.length} documentos',
                style: ProfessorLinksStyle.display(
                  13,
                  weight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      );
    }
    return ContractHighlightCard(
      key: const Key('training-center-contract-pending'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: ProfessorLinksKicker(
                  'Para assinar',
                  color: colors.readableTone(AppColors.brand),
                ),
              ),
              if (openCount > 1)
                Text(
                  '$openCount DOCUMENTOS',
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: colors.readableTone(AppColors.brand),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _docTitle(featured),
            style: ProfessorLinksStyle.display(17, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            _openPitch(featured),
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              height: 1.45,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(height: 12),
          ProfessorLinksPrimaryButton(
            key: const Key('training-center-contract-sign'),
            label: openCount > 1 ? 'Ver documentos' : 'Ler e assinar',
            height: 44,
            onPressed: () => openCount > 1
                ? openCenterContracts(context, center.centerId)
                : openCenterContract(
                    context,
                    center.centerId,
                    featured.contractId,
                  ),
          ),
        ],
      ),
    );
  }
}

// ── K6 · lista ───────────────────────────────────────────────────────────

class AthleteTrainingCenterContractsPage extends ConsumerWidget {
  const AthleteTrainingCenterContractsPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(athleteTrainingCenterProvider(centerId));
    final center = async.valueOrNull;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final guard = _guard(
      async,
      missing: center == null,
      missingText:
          'Não encontramos sua matrícula neste centro. Puxe para atualizar.',
    );
    final featured = center == null ? null : featuredOpenContract(center);
    final otherOpen = [
      for (final c in center?.openContracts ?? const <MyCenterContract>[])
        if (c != featured) c,
    ];
    final done = [
      for (final c in center?.contracts ?? const <MyCenterContract>[])
        if (!c.isOpen) c,
    ];

    return ProfessorLinksScaffold(
      title: 'Contratos',
      subtitle: center?.name.toUpperCase(),
      onBack: () => popOrGo(context, _centerPath(centerId)),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          refreshAthleteTrainingCenters(ref);
          await ref.read(athleteTrainingCentersProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (guard != null)
              guard
            else if (center!.contracts.isEmpty)
              const ProfessorLinksCard(
                key: Key('center-contracts-empty'),
                child: ProfessorMutedText(
                  'Nenhum contrato por aqui. Quando o centro enviar um '
                  'documento para assinar, ele aparece nesta tela.',
                ),
              )
            else ...[
              if (featured != null) ...[
                ContractHighlightCard(
                  key: const Key('center-contracts-featured'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ProfessorLinksKicker(
                        'Para assinar',
                        color: colors.readableTone(AppColors.brand),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _docTitle(featured),
                        style: ProfessorLinksStyle.display(
                          18,
                          color: colors.onSurface,
                        ),
                      ),
                      if (featured.planName.isNotEmpty ||
                          featured.className.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          [
                            featured.planName,
                            featured.className,
                          ].where((s) => s.isNotEmpty).join(' · '),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Text(
                        _openPitch(featured),
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          height: 1.45,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      const SizedBox(height: 12),
                      ProfessorLinksPrimaryButton(
                        key: const Key('center-contracts-featured-sign'),
                        label: 'Ler e assinar',
                        height: 44,
                        onPressed: () => openCenterContract(
                          context,
                          centerId,
                          featured.contractId,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
              if (otherOpen.isNotEmpty)
                ContractDocList(
                  children: [
                    for (final (i, c) in otherOpen.indexed)
                      ContractDocRow(
                        key: Key('center-contracts-row-${c.contractId}'),
                        first: i == 0,
                        title: c.title,
                        subtitle: contractStudentLine(
                          state: c.state(today),
                          optional: c.optional,
                          version: c.templateVersion,
                        ),
                        color: AppColors.brand,
                        trailing: ContractStateTag(
                          c.state(today),
                          label: 'Pendente',
                        ),
                        onTap: () =>
                            openCenterContract(context, centerId, c.contractId),
                      ),
                  ],
                ),
              if (done.isNotEmpty) ...[
                const TrainingSectionTitle('Assinados'),
                ContractDocList(
                  children: [
                    for (final (i, c) in done.indexed)
                      Builder(
                        builder: (context) {
                          final st = c.state(today);
                          return ContractDocRow(
                            key: Key('center-contracts-row-${c.contractId}'),
                            first: i == 0,
                            title: c.title,
                            subtitle: contractStudentLine(
                              state: st,
                              optional: c.optional,
                              version: c.templateVersion,
                              signedDay: _signedDay(c),
                              endDate: c.endDate,
                            ),
                            color: contractToneColor(
                              contractStateTone(st),
                              colors,
                            ),
                            onTap: () => openCenterContract(
                              context,
                              centerId,
                              c.contractId,
                            ),
                          );
                        },
                      ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

// ── K7 · leitura ─────────────────────────────────────────────────────────

class AthleteTrainingCenterContractPage extends ConsumerStatefulWidget {
  const AthleteTrainingCenterContractPage({
    super.key,
    required this.centerId,
    required this.contractId,
  });

  final String centerId;
  final String contractId;

  @override
  ConsumerState<AthleteTrainingCenterContractPage> createState() =>
      _AthleteTrainingCenterContractPageState();
}

class _AthleteTrainingCenterContractPageState
    extends ConsumerState<AthleteTrainingCenterContractPage> {
  final _scroll = ScrollController();
  final _reading = Stopwatch()..start();
  bool _openSent = false;

  /// O documento já está na tela (antes disso o spinner não conta como fim).
  bool _ready = false;
  bool _reachedEnd = false;
  double _progress = 0;

  /// Folga para "chegou ao fim" (o rodapé do papel não precisa encostar).
  static const _endSlack = 24.0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_measure);
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_measure)
      ..dispose();
    super.dispose();
  }

  void _measure() {
    if (!_ready || !_scroll.hasClients) return;
    final p = _scroll.position;
    final max = p.maxScrollExtent;
    final progress = max <= 0 ? 1.0 : (p.pixels / max).clamp(0.0, 1.0);
    final reached = _reachedEnd || max <= 0 || p.pixels >= max - _endSlack;
    if (progress != _progress || reached != _reachedEnd) {
      setState(() {
        _progress = progress;
        _reachedEnd = reached;
      });
    }
  }

  /// Marca "aberto" no servidor uma vez por abertura da tela.
  void _markOpened(MyCenterContract c) {
    if (_openSent || !c.isOpen) return;
    _openSent = true;
    ref
        .read(trainingCentersRepositoryProvider)
        .openContract(centerId: widget.centerId, contractId: c.contractId)
        .then((_) {}, onError: (_) {});
  }

  void _continue(MyCenterContract c) => context.pushNamed(
        AppRouteNames.athleteTrainingCenterContractSign,
        pathParameters: {
          'centerId': widget.centerId,
          'contractId': c.contractId
        },
        queryParameters: {'leitura': '${_reading.elapsed.inSeconds}'},
      );

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(athleteTrainingCenterProvider(widget.centerId));
    final center = async.valueOrNull;
    final c = center?.contractById(widget.contractId);
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final guard = _guard(
      async,
      missing: c == null,
      missingText:
          'Este documento não está mais na sua lista. Fale com o centro.',
    );
    if (c != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _ready = true;
        _markOpened(c);
        _measure();
      });
    }
    final open = c?.isOpen ?? false;

    final list = NotificationListener<ScrollMetricsNotification>(
      onNotification: (_) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _measure();
        });
        return false;
      },
      child: ListView(
        key: const Key('contract-read-scroll'),
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
        children: [
          if (guard != null)
            guard
          else ...[
            if (!open) ...[
              _SealCard(center: center!, contract: c!, todayKey: today),
              const SizedBox(height: 12),
            ],
            if (c!.essentials.isNotEmpty) ...[
              ContractEssentialsCard(rows: c.essentials),
              const SizedBox(height: 4),
            ],
            const TrainingSectionTitle('Texto completo'),
            ContractPaper(
              title: c.title,
              meta: [
                if (c.number.isNotEmpty) c.number,
                'v${c.templateVersion}',
              ].join(' · '),
              body: c.body,
              signatures: c.isSigned
                  ? _signatures(center!, c)
                  : const <(String, String)>[],
            ),
            if (open) ...[
              const SizedBox(height: 10),
              Text(
                'Fim do documento',
                key: const Key('contract-read-end'),
                textAlign: TextAlign.center,
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ],
        ],
      ),
    );

    return ProfessorLinksScaffold(
      title: c == null ? 'Contrato' : _docTitle(c),
      subtitle: c == null
          ? null
          : '${center!.name} · v${c.templateVersion}'.toUpperCase(),
      onBack: () => popOrGo(context, _centerPath(widget.centerId)),
      body: Column(
        children: [
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  key: const Key('contract-read-progress'),
                  value: _progress,
                  minHeight: 3,
                  color: AppColors.brand,
                  backgroundColor: colors.surfaceRaised,
                ),
              ),
            ),
          Expanded(child: list),
          if (open)
            _Footer(
              child: _reachedEnd
                  ? ProfessorLinksPrimaryButton(
                      key: const Key('contract-read-continue'),
                      label: c!.optional
                          ? 'Continuar para responder'
                          : 'Continuar para assinar',
                      onPressed: () => _continue(c),
                    )
                  : const ProfessorLinksGhostButton(
                      key: Key('contract-read-locked'),
                      label: 'Role até o fim para assinar',
                      height: 52,
                      onPressed: null,
                    ),
            ),
        ],
      ),
    );
  }
}

List<(String, String)> _signatures(
    TrainingCenterLink center, MyCenterContract c) {
  final at = c.signedAt == null
      ? ''
      : contractWallLabel(toNexagoEventLocal(c.signedAt!));
  return [
    (
      c.signerName.isEmpty ? 'Aluno' : c.signerName,
      '${c.asGuardian ? 'Responsável legal' : 'Aluno'} · $at',
    ),
    (center.name, 'Assinatura do centro · $at'),
  ];
}

/// Selo do documento já respondido (só leitura).
class _SealCard extends StatelessWidget {
  const _SealCard({
    required this.center,
    required this.contract,
    required this.todayKey,
  });

  final TrainingCenterLink center;
  final MyCenterContract contract;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final c = contract;
    final st = c.state(todayKey);
    final at = c.signedAt == null
        ? ''
        : contractWallLabel(toNexagoEventLocal(c.signedAt!));
    final (color, icon, title, text) = switch (st) {
      ContractState.declined => (
          ProfessorLinksStyle.dim(context.themeColors),
          Icons.block_rounded,
          'Você não autorizou',
          at.isEmpty ? 'Resposta registrada.' : 'Resposta registrada em $at.',
        ),
      ContractState.terminated => (
          ProfessorLinksStyle.dim(context.themeColors),
          Icons.history_rounded,
          'Contrato encerrado',
          'O ${center.name} encerrou este contrato. O texto assinado fica '
              'guardado aqui.',
        ),
      ContractState.expired => (
          AppColors.live,
          Icons.event_busy_outlined,
          'Vigência terminou',
          'Assinado em $at. O centro envia o novo contrato na renovação.',
        ),
      _ => (
          AppColors.win,
          Icons.verified_outlined,
          'Assinado',
          [
            if (at.isNotEmpty) 'Em $at',
            if (c.signerName.isNotEmpty)
              'por ${c.signerName}${c.asGuardian ? ' (responsável legal)' : ''}',
          ].join(' '),
        ),
    };
    return TrainingSealNote(
      key: const Key('contract-seal'),
      color: color,
      icon: icon,
      title: title,
      text: text.isEmpty || text.endsWith('.') ? text : '$text.',
    );
  }
}

/// Nota colorida com ícone (o selo e o bloqueio do pagamento).
class TrainingSealNote extends StatelessWidget {
  const TrainingSealNote({
    super.key,
    required this.color,
    required this.icon,
    required this.title,
    required this.text,
  });

  final Color color;
  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = colors.readableTone(color);
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tone),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: tone,
                  ),
                ),
                if (text.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    text,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      height: 1.45,
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

// ── K8 · assinar ─────────────────────────────────────────────────────────

class AthleteTrainingCenterContractSignPage extends ConsumerStatefulWidget {
  const AthleteTrainingCenterContractSignPage({
    super.key,
    required this.centerId,
    required this.contractId,
    this.readSeconds,
  });

  final String centerId;
  final String contractId;

  /// Tempo de leitura medido na K7; `null` = não passou pela leitura.
  final int? readSeconds;

  @override
  ConsumerState<AthleteTrainingCenterContractSignPage> createState() =>
      _AthleteTrainingCenterContractSignPageState();
}

class _AthleteTrainingCenterContractSignPageState
    extends ConsumerState<AthleteTrainingCenterContractSignPage> {
  bool _agreed = false;

  /// Termo opcional: `true` autorizo, `false` não autorizo, `null` sem escolha.
  bool? _authorize;
  bool _busy = false;

  bool _canSubmit(MyCenterContract c) {
    if (!c.optional) return _agreed;
    if (_authorize == false) return true;
    return _authorize == true && _agreed;
  }

  String _submitLabel(MyCenterContract c) {
    if (c.optional) {
      return _authorize == false ? 'Registrar recusa' : 'Assinar termo';
    }
    return c.isEnrollment ? 'Assinar contrato' : 'Assinar documento';
  }

  void _readFirst() => context.pushReplacementNamed(
        AppRouteNames.athleteTrainingCenterContract,
        pathParameters: {
          'centerId': widget.centerId,
          'contractId': widget.contractId,
        },
      );

  Future<void> _submit(MyCenterContract c) async {
    final accept = !c.optional || _authorize != false;
    setState(() => _busy = true);
    try {
      final version = await ref.read(contractSignAppVersionProvider.future);
      final r = await ref.read(trainingCentersRepositoryProvider).signContract(
            centerId: widget.centerId,
            contractId: c.contractId,
            accept: accept,
            sha256: c.sha256,
            readSeconds: widget.readSeconds ?? 0,
            platform: ref.read(contractSignPlatformProvider),
            appVersion: version,
          );
      refreshAthleteTrainingCenters(ref);
      if (!mounted) return;
      context.goNamed(
        AppRouteNames.athleteTrainingCenterContractSigned,
        pathParameters: {
          'centerId': widget.centerId,
          'contractId': c.contractId,
        },
        queryParameters: CenterContractSignedArgs(
          status: r.status,
          number: r.number,
          signedAt: r.signedAt,
        ).toQuery(),
      );
    } on ClassPresenceException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.maybeOf(context)
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(athleteTrainingCenterProvider(widget.centerId));
    final center = async.valueOrNull;
    final c = center?.contractById(widget.contractId);
    final guard = _guard(
      async,
      missing: c == null,
      missingText:
          'Este documento não está mais na sua lista. Fale com o centro.',
    );
    final ready = guard == null && c!.isOpen && widget.readSeconds != null;

    return ProfessorLinksScaffold(
      title: c?.optional == true ? 'Responder' : 'Assinar',
      subtitle: c == null
          ? null
          : '${_docTitle(c)} · v${c.templateVersion}'.toUpperCase(),
      onBack: () => popOrGo(context, _centerPath(widget.centerId)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                if (guard != null)
                  guard
                else if (!c!.isOpen)
                  const ProfessorLinksNote(
                    'Este documento não espera mais assinatura.',
                    tone: ProfessorLinksNoteTone.yellow,
                  )
                else if (widget.readSeconds == null) ...[
                  const ProfessorLinksNote(
                    'Leia o documento até o fim antes de assinar.',
                    tone: ProfessorLinksNoteTone.yellow,
                  ),
                  const SizedBox(height: 12),
                  ProfessorLinksGhostButton(
                    key: const Key('contract-sign-read-first'),
                    label: 'Ler o documento',
                    onPressed: _readFirst,
                  ),
                ] else
                  ..._form(context, center!, c),
              ],
            ),
          ),
          if (ready)
            _Footer(
              child: ProfessorLinksPrimaryButton(
                key: const Key('contract-sign-submit'),
                label: _submitLabel(c),
                loading: _busy,
                onPressed: _canSubmit(c) ? () => _submit(c) : null,
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _form(
    BuildContext context,
    TrainingCenterLink center,
    MyCenterContract c,
  ) {
    final colors = context.themeColors;
    final agreement = _AgreeCard(
      key: const Key('contract-sign-agree'),
      checked: _agreed,
      text: contractAgreementText(
        kind: c.kind,
        title: c.title,
        centerName: center.name,
        asGuardian: c.asGuardian,
        signerName: c.signerName,
        studentName: c.studentName,
      ),
      onChanged: _busy ? null : (v) => setState(() => _agreed = v),
    );
    return [
      if (c.optional) ...[
        ProfessorLinksCard(
          key: const Key('contract-sign-optional'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ProfessorLinksKicker(c.title),
              const SizedBox(height: 6),
              Text(
                'Este termo é opcional: recusar não muda a sua matrícula.',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  height: 1.45,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Choice(
                    key: const Key('contract-sign-authorize'),
                    label: 'Autorizo',
                    selected: _authorize == true,
                    onTap:
                        _busy ? null : () => setState(() => _authorize = true),
                  ),
                  const SizedBox(width: 8),
                  _Choice(
                    key: const Key('contract-sign-decline'),
                    label: 'Não autorizo',
                    selected: _authorize == false,
                    onTap:
                        _busy ? null : () => setState(() => _authorize = false),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (_authorize == true) ...[const SizedBox(height: 10), agreement],
      ] else
        agreement,
      const SizedBox(height: 12),
      Container(
        key: const Key('contract-sign-evidence'),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ProfessorLinksStyle.line(colors)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Registramos data, hora, dispositivo e o texto exato que você '
                'leu. O documento assinado fica aqui no app.',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  height: 1.45,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ),
          ],
        ),
      ),
    ];
  }
}

class _AgreeCard extends StatelessWidget {
  const _AgreeCard({
    super.key,
    required this.checked,
    required this.text,
    required this.onChanged,
  });

  final bool checked;
  final String text;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onChanged == null ? null : () => onChanged!(!checked),
      borderColor: checked ? AppColors.brand.withValues(alpha: 0.45) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            checked: checked,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              width: 22,
              height: 22,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                color: checked ? AppColors.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: checked
                      ? AppColors.brand
                      : ProfessorLinksStyle.line2(colors),
                  width: 1.5,
                ),
              ),
              child: checked
                  ? const Icon(
                      Icons.check_rounded,
                      size: 15,
                      color: ProfessorLinksStyle.onBrand,
                    )
                  : null,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                height: 1.5,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.14)
                : colors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.6)
                  : ProfessorLinksStyle.line(colors),
            ),
          ),
          child: Text(
            label,
            style: ProfessorLinksStyle.display(
              13,
              weight: FontWeight.w700,
              color: selected
                  ? colors.readableTone(AppColors.brand)
                  : ProfessorLinksStyle.mute(colors),
            ),
          ),
        ),
      ),
    );
  }
}

// ── K9 · assinado ────────────────────────────────────────────────────────

/// Resposta da assinatura levada na URL para a K9 (o recarregamento dos
/// centros pode chegar depois da tela).
class CenterContractSignedArgs {
  const CenterContractSignedArgs(
      {this.status, this.number = '', this.signedAt});

  factory CenterContractSignedArgs.fromQuery(Map<String, String> q) =>
      CenterContractSignedArgs(
        status:
            (q['decisao'] ?? '').trim().isEmpty ? null : q['decisao']!.trim(),
        number: (q['numero'] ?? '').trim(),
        signedAt: DateTime.tryParse(q['em'] ?? ''),
      );

  /// `signed` ou `declined`.
  final String? status;
  final String number;
  final DateTime? signedAt;

  Map<String, String> toQuery() => {
        if (status != null) 'decisao': status!,
        if (number.isNotEmpty) 'numero': number,
        if (signedAt != null) 'em': signedAt!.toUtc().toIso8601String(),
      };
}

class AthleteTrainingCenterContractSignedPage extends ConsumerWidget {
  const AthleteTrainingCenterContractSignedPage({
    super.key,
    required this.centerId,
    required this.contractId,
    this.result = const CenterContractSignedArgs(),
  });

  final String centerId;
  final String contractId;
  final CenterContractSignedArgs result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(athleteTrainingCenterProvider(centerId));
    final center = async.valueOrNull;
    final c = center?.contractById(contractId);
    final guard = _guard(
      async,
      missing: c == null,
      missingText: 'Documento respondido. Ele aparece em Contratos, na tela '
          'do centro.',
    );
    final declined = (result.status ?? c?.status) == 'declined';
    final invoice = declined ? null : center?.openInvoiceOf(c?.enrollmentId);
    final number = result.number.isNotEmpty ? result.number : c?.number ?? '';
    final signedAt = result.signedAt ?? c?.signedAt;
    final at =
        signedAt == null ? '' : contractWallLabel(toNexagoEventLocal(signedAt));
    final tone = declined ? ProfessorLinksStyle.dim(colors) : AppColors.win;

    return ProfessorLinksScaffold(
      title: '',
      showBack: false,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
              children: [
                if (guard != null)
                  guard
                else ...[
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: tone.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: tone.withValues(alpha: 0.35)),
                      ),
                      child: Icon(
                        Icons.check_rounded,
                        size: 30,
                        color: colors.readableTone(tone),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    declined
                        ? 'Recusa registrada'
                        : c!.isEnrollment
                            ? 'Contrato assinado'
                            : 'Documento assinado',
                    key: const Key('contract-signed-title'),
                    style: ProfessorLinksStyle.display(
                      26,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    declined
                        ? 'O centro recebe a sua resposta. Se mudar de ideia, '
                            'fale com a recepção.'
                        : invoice != null
                            ? 'Falta só o pagamento para confirmar sua vaga'
                                '${c!.className.isEmpty ? '' : ' na ${c.className}'}.'
                            : 'O documento assinado fica aqui no app, em '
                                'Contratos.',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 13,
                      height: 1.5,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ProfessorRowsBlock(
                    children: [
                      ProfessorInfoRow(
                        label: 'Documento',
                        value: number.isEmpty ? c!.title : number,
                      ),
                      ProfessorInfoRow(
                        label: declined ? 'Respondido em' : 'Assinado em',
                        value: at.isEmpty ? 'Agora' : at,
                      ),
                      if (c!.optional)
                        ProfessorInfoRow(
                          label: c.title,
                          value: declined ? 'Não autorizado' : 'Autorizado',
                        ),
                      const ProfessorInfoRow(
                        label: 'Cópia',
                        value: 'Disponível aqui no app',
                        last: true,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          _Footer(
            child: invoice != null
                ? ProfessorLinksPrimaryButton(
                    key: const Key('contract-signed-pay'),
                    label:
                        'Ir para pagamento · ${formatBRLFromCents(invoice.amountCents)}',
                    onPressed: () => context.goNamed(
                      AppRouteNames.athleteTrainingCenterInvoice,
                      pathParameters: {
                        'centerId': centerId,
                        'invoiceId': invoice.invoiceId,
                      },
                    ),
                  )
                : ProfessorLinksPrimaryButton(
                    key: const Key('contract-signed-back'),
                    label: 'Voltar ao centro',
                    onPressed: () => context.goNamed(
                      AppRouteNames.athleteTrainingCenter,
                      pathParameters: {'centerId': centerId},
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
