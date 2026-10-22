import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/training_center.dart';
import '../domain/training_plans.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/training_centers_repository.dart';
import 'widgets/training_origin_widgets.dart';

enum _Method { pix, card }

/// F2/F3/F5 · Fatura do centro — destino do push da cobrança. Pix (QR e
/// copia-e-cola) no app, cartão pela fatura do provedor e "Já paguei ·
/// verificar". A cobrança é do CENTRO; a fatura só muda para paga quando o
/// provedor confirma.
class AthleteTrainingCenterInvoicePage extends ConsumerStatefulWidget {
  const AthleteTrainingCenterInvoicePage({
    super.key,
    required this.centerId,
    required this.invoiceId,
  });

  final String centerId;
  final String invoiceId;

  @override
  ConsumerState<AthleteTrainingCenterInvoicePage> createState() =>
      _AthleteTrainingCenterInvoicePageState();
}

class _AthleteTrainingCenterInvoicePageState
    extends ConsumerState<AthleteTrainingCenterInvoicePage> {
  _Method _method = _Method.pix;
  bool _copied = false;
  bool _checking = false;

  /// Resultado do "Já paguei": `null` = ainda não verificou.
  String? _checked;

  ({String centerId, String invoiceId}) get _key =>
      (centerId: widget.centerId, invoiceId: widget.invoiceId);

  Future<void> _check() async {
    setState(() => _checking = true);
    try {
      final status = await ref
          .read(trainingCentersRepositoryProvider)
          .checkInvoice(centerId: widget.centerId, invoiceId: widget.invoiceId);
      refreshAthleteTrainingCenters(ref);
      if (mounted) setState(() => _checked = status);
    } on ClassPresenceException catch (e) {
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)
          ?..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(athleteTrainingCenterProvider(widget.centerId));
    final center = async.valueOrNull;
    CenterInvoice? invoice;
    for (final i in center?.invoices ?? const <CenterInvoice>[]) {
      if (i.invoiceId == widget.invoiceId) invoice = i;
    }
    final todayKey = nexagoEventDayKey(
      ref.watch(professorLinksClockProvider)(),
    );
    final paid = invoice?.isPaid == true || _checked == 'approved';

    return ProfessorLinksScaffold(
      title: 'Fatura',
      subtitle: invoice == null
          ? null
          : '${invoice.reference.toUpperCase()} · ${center!.name.toUpperCase()}',
      onBack: () => popOrGo(
        context,
        '${AppRoutes.athleteTrainingCenter.replaceFirst(':centerId', widget.centerId)}?aba=plano',
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (async.isLoading && center == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (center == null || invoice == null)
            const ProfessorLinksCard(
              key: Key('center-invoice-missing'),
              child: ProfessorMutedText(
                'Esta fatura não está mais na sua lista. Confira os '
                'pagamentos do centro.',
              ),
            )
          else if (paid) ...[
            _PaidHero(key: const Key('center-invoice-paid'), invoice: invoice),
            const SizedBox(height: 12),
            _Summary(center: center, invoice: invoice, todayKey: todayKey),
          ] else if (invoice.status == 'refunded' ||
              invoice.status == 'disputed') ...[
            _Summary(center: center, invoice: invoice, todayKey: todayKey),
            const SizedBox(height: 12),
            ProfessorLinksNote(
              invoice.status == 'refunded'
                  ? 'Esta cobrança foi estornada pelo centro.'
                  : 'Esta cobrança está em disputa no provedor. Fale com o '
                        'centro.',
            ),
          ] else ...[
            _Summary(center: center, invoice: invoice, todayKey: todayKey),
            if (invoice.status == 'failed') ...[
              const SizedBox(height: 12),
              const TrainingOriginNote(
                key: Key('center-invoice-failed'),
                color: AppColors.live,
                icon: Icons.credit_card_off_outlined,
                title: 'Pagamento não aprovado',
                text:
                    'O cartão foi recusado. Pague com Pix ou tente outro '
                    'cartão na fatura.',
              ),
            ],
            const SizedBox(height: 16),
            ArenaClassSegmented<_Method>(
              items: const [(_Method.pix, 'Pix'), (_Method.card, 'Cartão')],
              selected: _method,
              onChanged: (m) => setState(() => _method = m),
            ),
            const SizedBox(height: 12),
            if (_method == _Method.pix)
              _pix(context)
            else
              _card(context, invoice),
            const SizedBox(height: 12),
            if (_checked != null && _checked != 'approved')
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: TrainingOriginNote(
                  key: Key('center-invoice-not-yet'),
                  color: ProfessorLinksStyle.blue,
                  icon: Icons.schedule_rounded,
                  title: 'Ainda não confirmou',
                  text:
                      'Se você acabou de pagar, o banco pode levar alguns '
                      'minutos. A fatura muda sozinha, e você recebe um aviso. '
                      'Não pague de novo.',
                ),
              ),
            ProfessorLinksPrimaryButton(
              key: const Key('center-invoice-check'),
              label: 'Já paguei · verificar',
              loading: _checking,
              onPressed: _checking ? null : _check,
            ),
            const SizedBox(height: 12),
            Text(
              'Cobrança feita pelo ${center.name}. A fatura só muda para paga '
              'quando o provedor confirma.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.45,
                color: ProfessorLinksStyle.dim(context.themeColors),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _pix(BuildContext context) {
    final colors = context.themeColors;
    final pix = ref.watch(centerInvoicePixProvider(_key));
    return pix.when(
      loading: () => const ProfessorLinksCard(
        child: SizedBox(
          height: 160,
          child: Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        ),
      ),
      error: (e, _) => ProfessorRetryCard(
        message: e is ClassPresenceException
            ? e.message
            : 'Não foi possível gerar o Pix agora.',
        onRetry: () => ref.invalidate(centerInvoicePixProvider(_key)),
      ),
      data: (p) {
        if (p.pixPayload.isEmpty) {
          return ProfessorLinksCard(
            key: const Key('center-invoice-no-pix'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const ProfessorMutedText(
                  'O Pix copia-e-cola não veio do provedor agora. Pague pela '
                  'fatura, que aceita Pix e cartão.',
                ),
                if (p.invoiceUrl.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ProfessorLinksGhostButton(
                    label: 'Abrir fatura',
                    onPressed: () => openExternalUrl(p.invoiceUrl),
                  ),
                ],
              ],
            ),
          );
        }
        return ProfessorLinksCard(
          key: const Key('center-invoice-pix'),
          padding: const EdgeInsets.all(15),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: QrImageView(
                  data: p.pixPayload,
                  size: 170,
                  padding: EdgeInsets.zero,
                  backgroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ProfessorLinksGhostButton(
                  key: const Key('center-invoice-copy'),
                  label: _copied ? 'Código copiado' : 'Copiar código Pix',
                  height: 44,
                  color: _copied ? AppColors.win : null,
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: p.pixPayload));
                    if (mounted) setState(() => _copied = true);
                  },
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 13,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      'Confirmação automática depois do pagamento',
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _card(BuildContext context, CenterInvoice invoice) {
    final pixUrl =
        ref.watch(centerInvoicePixProvider(_key)).valueOrNull?.invoiceUrl ?? '';
    final url = invoice.payUrl ?? (pixUrl.isEmpty ? null : pixUrl);
    return ProfessorLinksCard(
      key: const Key('center-invoice-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ProfessorMutedText(
            'O cartão é digitado na página segura do provedor de pagamento. '
            'O NexaGO não guarda os dados do cartão.',
          ),
          const SizedBox(height: 12),
          ProfessorLinksPrimaryButton(
            key: const Key('center-invoice-open-card'),
            label: 'Pagar com cartão',
            height: 46,
            onPressed: url == null ? null : () => openExternalUrl(url),
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.center,
    required this.invoice,
    required this.todayKey,
  });

  final TrainingCenterLink center;
  final CenterInvoice invoice;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final i = invoice;
    final overdue = i.isOverdue(todayKey);
    final statusColor = i.isPaid
        ? AppColors.win
        : overdue || i.status == 'failed'
        ? AppColors.live
        : AppColors.pending;
    CenterEnrollment? e;
    for (final x in center.enrollments) {
      e ??= x;
    }
    return TrainingOriginHeader(
      key: const Key('center-invoice-summary'),
      origin: TrainingOrigin.center,
      name: center.name,
      line: i.reference,
      extra: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                formatBRLFromCents(i.amountCents),
                style: ProfessorLinksStyle.display(30, color: colors.onSurface),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  i.isPaid
                      ? (i.paidOn == null
                            ? 'paga'
                            : 'paga em ${trainingPlanShortDate(i.paidOn!)}')
                      : '${overdue ? 'venceu' : 'vence'} '
                            '${trainingPlanShortDate(i.dueDate)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: overdue
                        ? colors.readableTone(AppColors.live)
                        : ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  e == null ? 'Mensalidade' : '${e.className} · ${e.planName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                centerInvoiceStatusLabel(i, todayKey),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(statusColor),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PaidHero extends StatelessWidget {
  const _PaidHero({super.key, required this.invoice});

  final CenterInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 22),
      decoration: BoxDecoration(
        color: AppColors.win.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.win.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: const BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 30,
              color: ProfessorLinksStyle.onBrand,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Mensalidade paga',
            style: ProfessorLinksStyle.display(22, color: colors.onSurface),
          ),
          const SizedBox(height: 4),
          Text(
            'O provedor confirmou o pagamento. O recibo é enviado pelo centro.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              height: 1.45,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}
