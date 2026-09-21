import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arena/domain/payout_pix_key_type.dart';
import '../data/organizer_wallet_repository.dart';
import '../domain/organizer_wallet_providers.dart';

/// Caixa de cada EVENTO que a pessoa alcança: saldo, extrato, saques e o
/// pedido de saque.
///
/// O dinheiro das inscrições cai em `tournamentWallets/{tournamentId}`, não
/// mais numa carteira por pessoa. Então a tela não é "uma carteira": é a lista
/// dos caixas de evento que o dono e os GESTORES da equipe alcançam, e tudo
/// abaixo (saldo, extrato, saques) é do caixa escolhido. Quem é ADMINISTRADOR
/// do evento organiza o resto e não vê dinheiro — cai no estado vazio.
///
/// A chave PIX de saque é dado da PESSOA (`organizerPayoutProfiles/{uid}`),
/// não do caixa: cada um saca do caixa compartilhado para a própria chave. Por
/// isso o card da chave é sempre editável e não depende do caixa em exibição.
class OrganizerFinancialPage extends ConsumerStatefulWidget {
  const OrganizerFinancialPage({super.key});

  @override
  ConsumerState<OrganizerFinancialPage> createState() =>
      _OrganizerFinancialPageState();
}

class _OrganizerFinancialPageState
    extends ConsumerState<OrganizerFinancialPage> {
  final _amountController = TextEditingController();
  bool _submitting = false;

  /// Eco do servidor depois de salvar a chave PIX, e só no SUCESSO da
  /// callable. Este card mostra o DESTINO do saque: afirmar um destino que o
  /// servidor não gravou manda o dinheiro para a chave antiga. O servidor
  /// ainda normaliza a chave (telefone ganha `+55`), então o que fica na tela
  /// é o que ele devolveu, não o que foi digitado.
  ///
  /// Vale só até a próxima vista chegar (ver o `ref.listen` no `build`): se a
  /// pessoa trocar a chave no portal ou em outro aparelho, é o perfil recém
  /// carregado que manda — o eco não pode envelhecer na tela justamente no
  /// card que diz para onde o dinheiro vai.
  OrganizerPayoutProfile? _savedPayout;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  /// Regras do valor moram em `domain/` (piso, teto e parse de vírgula) — aqui
  /// só passa o texto do campo.
  String? _amountError(double available) => withdrawalAmountError(
        raw: _amountController.text,
        availableReais: available,
      );

  /// Quem responde "dá para sacar?" é o perfil de repasse confirmado pelo
  /// servidor — nunca um rascunho de formulário.
  bool _canSubmit({required double available, required bool hasPixKey}) {
    if (_submitting) return false;
    if (!hasPixKey) return false;
    return canRequestWithdrawalAmount(
      raw: _amountController.text,
      availableReais: available,
    );
  }

  void _withdrawAll(double available) {
    if (available <= 0) return;
    _amountController.text = available.toStringAsFixed(2).replaceAll('.', ',');
    setState(() {});
  }

  /// A chave é da pessoa, então o card é editável em qualquer estado da tela —
  /// inclusive sem caixa nenhum. Na falha do save a tela segue mostrando o
  /// destino que o servidor tem, não o que foi digitado.
  Future<void> _editPixKey(OrganizerPayoutProfile payout) async {
    final result = await showModalBottomSheet<(PayoutPixKeyType, String)>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PixKeyEditSheet(
        // Sem chave gravada não há o que inferir: o padrão do formulário
        // continua sendo CPF, como antes.
        initialType: payout.hasPixKey
            ? PayoutPixKeyType.initial(
                storedType: payout.pixKeyType,
                pixKey: payout.pixKey,
              )
            : PayoutPixKeyType.cpf,
        initialKey: payout.pixKey,
      ),
    );
    if (result == null) return;
    try {
      final saved =
          await ref.read(organizerWalletRepositoryProvider).setPayoutPixKey(
                pixKey: result.$2,
                pixKeyType: result.$1.asaasValue,
              );
      if (!mounted) return;
      setState(() => _savedPayout = saved);
      showAppSnackBar(context, 'Chave PIX salva.');
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Não foi possível salvar a chave: $e',
            isError: true);
      }
    }
  }

  /// Saque do caixa do evento escolhido. A chave PIX não vai no pedido: o
  /// destino é o perfil de quem pede, resolvido no servidor.
  Future<void> _requestWithdrawal({
    required String tournamentId,
    required double available,
  }) async {
    final error = _amountError(available);
    if (error != null) {
      showAppSnackBar(context, error, isError: true);
      return;
    }
    final amount = parseWithdrawalAmount(_amountController.text);
    if (amount == null || amount < minWithdrawalReais) return;

    setState(() => _submitting = true);
    try {
      final result =
          await ref.read(organizerWalletRepositoryProvider).requestWithdrawal(
                tournamentId: tournamentId,
                amountReais: amount,
              );
      if (!mounted) return;
      _amountController.clear();
      showAppSnackBar(
        context,
        _resultMessage(result),
        isError: result.status == 'pending' && result.payoutStatus == 'failed',
      );
      // O listener do caixa cobre o saldo, mas não o extrato nem a lista de
      // saques: recarrega a vista DESTE caixa.
      _reloadCashBox(tournamentId);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Não foi possível solicitar: $e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _selectCashBox(String tournamentId) {
    if (tournamentId == ref.read(selectedCashBoxIdProvider)) return;
    // O valor digitado valia para o saldo do caixa anterior.
    _amountController.clear();
    ref.read(selectedCashBoxIdProvider.notifier).state = tournamentId;
  }

  /// Recarrega o caixa que está NA TELA, fixando a seleção nele.
  ///
  /// Recarregar com a seleção vazia pediria de novo "o caixa mais cheio de
  /// agora", e é aí que estava o defeito: o saque move o disponível do caixa
  /// atual para pendente, o servidor passa a devolver OUTRO evento, e a tela
  /// troca de caixa sozinha depois do pedido — extrato de outro evento, saldo
  /// que sobe, nenhum sinal do saque recém-pedido e o próximo saque saindo do
  /// caixa errado. Por isso todo recarregamento daqui para frente vai com o
  /// `tournamentId` explícito.
  ///
  /// Fixar a seleção numa chave nova já dispara a carga dessa chave; se ela já
  /// era a observada, aí sim é preciso invalidar — invalidar uma chave
  /// diferente da observada não recarrega nada.
  void _reloadCashBox(String tournamentId) {
    if (tournamentId.isEmpty) return;
    if (ref.read(selectedCashBoxIdProvider) != tournamentId) {
      ref.read(selectedCashBoxIdProvider.notifier).state = tournamentId;
      return;
    }
    ref.invalidate(organizerWalletViewProvider(tournamentId));
  }

  String _resultMessage(OrganizerWithdrawalRequestResult r) {
    if (r.autoProcessed && r.status == 'approved' && r.payoutStatus == 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (r.message != null && r.message!.trim().isNotEmpty) {
      return r.message!.trim();
    }
    if (r.status == 'pending' && r.processingMode == 'manual_review') {
      return 'Saque acima de R\$ 500. Aguardando aprovação da plataforma.';
    }
    return 'Saque solicitado. Aguarde aprovação.';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final selectedId = ref.watch(selectedCashBoxIdProvider);
    final walletAsync = ref.watch(organizerWalletViewProvider(selectedId));

    // Vista nova traz o perfil de repasse atual do servidor, então o eco local
    // do último save sai de cena. Sem isso ele venceria toda recarga pelo
    // resto da vida da tela, e uma chave trocada no portal ficaria invisível
    // aqui — no card que diz o destino do saque.
    ref.listen(organizerWalletViewProvider(selectedId), (_, next) {
      if (next.isLoading || !next.hasValue) return;
      if (_savedPayout != null) setState(() => _savedPayout = null);
    });

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        backgroundColor: colors.canvas,
        elevation: 0,
        title: const Text('Financeiro'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: _body(walletAsync, selectedId),
      ),
    );
  }

  /// Três estados que não se misturam: carga em andamento, falha de carga e
  /// vista carregada. Só DENTRO da vista carregada é que `selected == null`
  /// quer dizer "não alcança caixa nenhum" — apresentar falha de rede como
  /// estado vazio diria à pessoa que ela perdeu o acesso ao dinheiro.
  Widget _body(AsyncValue<OrganizerWalletView> walletAsync, String? selectedId) {
    final view = walletAsync.valueOrNull;
    final busy = walletAsync.isLoading;
    if (view == null) {
      if (walletAsync.hasError) {
        return AppErrorView(
          title: 'Não foi possível carregar o Financeiro',
          message: 'Falhou a busca dos caixas dos seus eventos. Nada foi '
              'perdido: o saldo, o extrato e os saques continuam no lugar.',
          // Enquanto a nova tentativa está no ar o card é idêntico ao de
          // antes — e com o cold start da callable (5–16 s) a pessoa toca de
          // novo e dispara N cargas. O rótulo é o único sinal de vida.
          retryLabel: busy ? 'Tentando…' : 'Tentar de novo',
          onRetry: busy
              ? () {}
              : () => ref.invalidate(organizerWalletViewProvider(selectedId)),
        );
      }
      return const AppLoadingView(
        message: 'Carregando o caixa dos seus eventos…',
      );
    }

    // Erro SOBRE dado carregado: `AsyncError.copyWithPrevious` preserva
    // `hasValue`, então este caso nunca cai no card de erro acima. Sem aviso, a
    // recarga que falhou depois de um saque deixaria o saldo caindo pelo
    // listener enquanto o extrato e os saques seguem velhos — dinheiro saindo
    // sem linha de saque nenhuma na tela.
    final staleWarning = walletAsync.hasError;

    final payout = _savedPayout ?? view.payout;
    final selected = view.selected;
    if (selected == null) {
      return _noCashBoxBody(
        payout,
        staleWarning: staleWarning,
        busy: busy,
        selectedId: selectedId,
      );
    }

    // Saldo ao vivo por cima da linha que a callable trouxe: a fusão mantém o
    // nome do torneio, que o doc do caixa não guarda. Stream com erro não
    // emite, e aí o valor da callable é o que fica na tela.
    final live = ref
        .watch(organizerCashBoxLiveProvider(selected.tournamentId))
        .valueOrNull;
    final current = applyLiveBalance(selected, live);
    final boxes = view.cashBoxes
        .map((b) => applyLiveBalance(b, live))
        .toList(growable: false);
    final available = current.availableReais;
    final viewerUid = ref.watch(currentOrganizerIdProvider) ?? '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (staleWarning) ...[
          _StaleDataWarning(
            busy: busy,
            onRetry: () => _reloadCashBox(current.tournamentId),
          ),
          const SizedBox(height: 14),
        ],
        if (boxes.length > 1)
          _CashBoxSelector(
            boxes: boxes,
            selectedId: current.tournamentId,
            totals: sumCashBoxes(boxes),
            onSelect: _selectCashBox,
          )
        else
          _SingleCashBoxLine(name: current.tournamentName),
        const SizedBox(height: 14),
        _BalanceCard(box: current),
        const SizedBox(height: 20),
        _PixKeyRow(payout: payout, onEdit: () => _editPixKey(payout)),
        const SizedBox(height: 20),
        _WithdrawCard(
          amountController: _amountController,
          amountError: _amountError(available),
          canSubmit: _canSubmit(
            available: available,
            hasPixKey: payout.hasPixKey,
          ),
          submitting: _submitting,
          hasPixKey: payout.hasPixKey,
          onChanged: () => setState(() {}),
          onWithdrawAll: () => _withdrawAll(available),
          onSubmit: () => _requestWithdrawal(
            tournamentId: current.tournamentId,
            available: available,
          ),
        ),
        const SizedBox(height: 28),
        _SectionTitle('Saques'),
        const SizedBox(height: 8),
        if (view.withdrawals.isEmpty)
          _EmptyLine('Nenhum saque ainda.')
        else
          ...view.withdrawals.map(
            (w) => _WithdrawalTile(item: w, viewerUid: viewerUid),
          ),
        const SizedBox(height: 24),
        _SectionTitle('Recebimentos de inscrições'),
        const SizedBox(height: 8),
        if (view.ledger.isEmpty)
          _EmptyLine('Nenhum recebimento ainda.')
        else
          ...view.ledger.map((e) => _LedgerTile(entry: e)),
      ],
    );
  }

  /// `selected == null`: a pessoa não alcança caixa nenhum. É o que vê quem é
  /// ADMINISTRADOR do evento — organiza tudo e não toca no dinheiro — e também
  /// quem acabou de criar o primeiro evento e ainda não teve inscrição paga
  /// pela plataforma. Por isso o texto explica a regra em vez de dizer que não
  /// há nada aqui. A chave PIX continua editável: ela é da pessoa.
  Widget _noCashBoxBody(
    OrganizerPayoutProfile payout, {
    required bool staleWarning,
    required bool busy,
    required String? selectedId,
  }) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (staleWarning) ...[
          _StaleDataWarning(
            busy: busy,
            // Sem caixa em exibição não há id para fixar: a nova tentativa é
            // da mesma chave que já está sendo observada.
            onRetry: () =>
                ref.invalidate(organizerWalletViewProvider(selectedId)),
          ),
          const SizedBox(height: 14),
        ],
        const _NoCashBoxCard(),
        const SizedBox(height: 20),
        _PixKeyRow(payout: payout, onEdit: () => _editPixKey(payout)),
        const SizedBox(height: 10),
        _EmptyLine(
          'É a sua chave — o saque de qualquer caixa que você alcança vai '
          'para ela.',
        ),
      ],
    );
  }
}

/// Aviso de recarga que falhou com dado já na tela. É aviso, não substituição:
/// os números continuam valendo, só podem estar velhos — e trocar a tela pelo
/// card de erro esconderia o saldo e o extrato que a pessoa já tinha.
class _StaleDataWarning extends StatelessWidget {
  const _StaleDataWarning({required this.busy, required this.onRetry});

  final bool busy;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded,
              size: 18, color: AppColors.pending),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Não foi possível atualizar o caixa. O extrato e os saques '
              'abaixo podem estar desatualizados.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurface,
                    height: 1.35,
                  ),
            ),
          ),
          TextButton(
            onPressed: busy ? null : onRetry,
            child: Text(busy ? 'Tentando…' : 'Tentar de novo'),
          ),
        ],
      ),
    );
  }
}

/// Lista dos caixas alcançados, com o saldo de cada um na cara: a pessoa
/// decide de qual evento está falando antes de olhar os números abaixo.
class _CashBoxSelector extends StatelessWidget {
  const _CashBoxSelector({
    required this.boxes,
    required this.selectedId,
    required this.totals,
    required this.onSelect,
  });

  final List<TournamentCashBox> boxes;
  final String selectedId;
  final TournamentCashBoxTotals totals;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final pending = totals.pendingReais > 0.001
        ? ' · ${formatBRL(totals.pendingReais)} em processamento'
        : '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Caixa do evento',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
        ),
        const SizedBox(height: 2),
        Text(
          '${formatBRL(totals.availableReais)} somando seus caixas$pending',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
        ),
        const SizedBox(height: 10),
        ...boxes.map(
          (b) => _CashBoxOption(
            box: b,
            selected: b.tournamentId == selectedId,
            onTap: () => onSelect(b.tournamentId),
          ),
        ),
      ],
    );
  }
}

class _CashBoxOption extends StatelessWidget {
  const _CashBoxOption({
    required this.box,
    required this.selected,
    required this.onTap,
  });

  final TournamentCashBox box;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final pending = box.pendingReais > 0.001
        ? ' · ${formatBRL(box.pendingReais)} em processamento'
        : '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: selected ? null : onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : colors.outline.withValues(alpha: 0.4),
                width: selected ? 1.4 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded,
                  size: 18,
                  color: selected ? AppColors.brand : colors.onSurfaceMuted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _cashBoxTitle(box),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                      ),
                      Text(
                        '${formatBRL(box.availableReais)}$pending',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: colors.onSurfaceMuted,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Com um caixa só não há o que escolher — mas ainda é preciso dizer de qual
/// evento é o dinheiro da tela.
class _SingleCashBoxLine extends StatelessWidget {
  const _SingleCashBoxLine({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Icon(Icons.emoji_events_rounded, size: 16, color: colors.onSurfaceMuted),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'Caixa de ${name.trim().isEmpty ? 'um evento seu' : name.trim()}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: colors.onSurfaceMuted,
                ),
          ),
        ),
      ],
    );
  }
}

/// O estado de quem não alcança caixa nenhum. Explica quem vê dinheiro e por
/// quê, porque quem cai aqui costuma ser o administrador do evento (que
/// organiza tudo menos o caixa) ou o organizador antes da primeira inscrição
/// paga pela plataforma.
class _NoCashBoxCard extends StatelessWidget {
  const _NoCashBoxCard();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final body = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: colors.onSurfaceMuted,
          height: 1.45,
        );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'O caixa é de quem responde pelo dinheiro do evento',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
          ),
          const SizedBox(height: 10),
          Text(
            'O Financeiro mostra o caixa de cada evento — o dinheiro das '
            'inscrições pagas pela plataforma. Quem vê e quem saca é o dono do '
            'evento e os gestores da equipe dele; quem é administrador do '
            'evento cuida de tudo, menos do dinheiro.',
            style: body,
          ),
          const SizedBox(height: 10),
          Text(
            'Se você acabou de criar seu primeiro evento, o caixa aparece aqui '
            'quando a primeira inscrição for paga pela plataforma. Inscrição '
            'recebida direto com você não passa pela plataforma e por isso não '
            'entra no caixa.',
            style: body,
          ),
          const SizedBox(height: 10),
          Text(
            'Se você é gestor de um evento e ele não aparece aqui, peça a quem '
            'é dono para conferir o seu papel na equipe do evento.',
            style: body,
          ),
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.box});

  final TournamentCashBox box;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Disponível para saque',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            formatBRL(box.availableReais),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
          ),
          if (box.pendingReais > 0.001) ...[
            const SizedBox(height: 6),
            Text(
              '${formatBRL(box.pendingReais)} em processamento',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.pending,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

String _cashBoxTitle(TournamentCashBox box) {
  final name = box.tournamentName.trim();
  return name.isEmpty ? 'Evento sem nome' : name;
}

/// Destino do saque de quem está logado. Mostra o que o SERVIDOR guardou
/// (`payout`), nunca o rascunho do formulário.
class _PixKeyRow extends StatelessWidget {
  const _PixKeyRow({
    required this.payout,
    required this.onEdit,
  });

  final OrganizerPayoutProfile payout;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hasKey = payout.hasPixKey;
    final pixKey = payout.pixKey;
    final keyType = PayoutPixKeyType.initial(
      storedType: payout.pixKeyType,
      pixKey: pixKey,
    );
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.pix_rounded, color: AppColors.brand, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Chave PIX de repasse',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceMuted,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hasKey ? '${keyType.label} · $pixKey' : 'Cadastrar chave',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.edit_rounded, color: colors.onSurfaceMuted, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _WithdrawCard extends StatelessWidget {
  const _WithdrawCard({
    required this.amountController,
    required this.amountError,
    required this.canSubmit,
    required this.submitting,
    required this.hasPixKey,
    required this.onChanged,
    required this.onWithdrawAll,
    required this.onSubmit,
  });

  final TextEditingController amountController;
  final String? amountError;
  final bool canSubmit;
  final bool submitting;
  final bool hasPixKey;
  final VoidCallback onChanged;
  final VoidCallback onWithdrawAll;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: amountController,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                  ],
                  onChanged: (_) => onChanged(),
                  decoration: InputDecoration(
                    labelText: 'Valor do saque',
                    prefixText: 'R\$ ',
                    errorText: amountError,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(onPressed: onWithdrawAll, child: const Text('Tudo')),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: canSubmit ? onSubmit : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.black,
                      ),
                    )
                  : const Text(
                      'Solicitar saque',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
            ),
          ),
          const SizedBox(height: 8),
          // O caixa é do evento e cada gestor saca para a PRÓPRIA chave. Dizer
          // isso aqui evita o gestor achar que está tirando dinheiro para a
          // conta do dono.
          Text(
            'O valor vai sempre para a sua chave PIX acima. Se o evento não é '
            'seu, quem é dono dele é avisado do pedido.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
          ),
          if (!hasPixKey) ...[
            const SizedBox(height: 8),
            Text(
              'Cadastre uma chave PIX acima para sacar.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Uma linha do histórico de saques do caixa. O caixa é compartilhado, então a
/// linha pode ser o saque de outra pessoa da equipe: o rótulo diz de quem foi,
/// e a chave PIX de saque alheio já chega MASCARADA do servidor — é exibida
/// exatamente como veio.
class _WithdrawalTile extends StatelessWidget {
  const _WithdrawalTile({required this.item, required this.viewerUid});

  final OrganizerWithdrawalItem item;
  final String viewerUid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (label, color) = switch (item.status) {
      'approved' => ('Aprovado', AppColors.win),
      'rejected' => ('Rejeitado', AppColors.live),
      _ => ('Pendente', AppColors.pending),
    };
    final requester = withdrawalRequesterLabel(
      requestedBy: item.requestedBy,
      requestedByStaff: item.requestedByStaff,
      viewerUid: viewerUid,
    );
    final date = _formatDate(item.createdAt);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatBRL(item.amountReais),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                ),
                Text(
                  date.isEmpty ? requester : '$date · $requester',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                ),
                if (item.pixKey.trim().isNotEmpty)
                  Text(
                    'para ${item.pixKey.trim()}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.entry});

  final OrganizerLedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // A dupla/equipe que pagou: a callable resolve esse rótulo (custa leitura
    // de inscrição) e o app vinha jogando fora, deixando o extrato mais pobre
    // que o do portal. Sem rótulo, `—`, como no portal.
    final label = entry.athleteLabel.trim();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.isEmpty ? '—' : label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                ),
                Text(
                  '+ ${formatBRL(entry.netReais)}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.win,
                      ),
                ),
                Text(
                  '${_formatDate(entry.createdAt)} · taxa ${formatBRL(entry.platformFeeReais)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
    );
  }
}

String _formatDate(DateTime? d) {
  if (d == null) return '';
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class _PixKeyEditSheet extends StatefulWidget {
  const _PixKeyEditSheet({required this.initialType, required this.initialKey});

  final PayoutPixKeyType initialType;
  final String initialKey;

  @override
  State<_PixKeyEditSheet> createState() => _PixKeyEditSheetState();
}

class _PixKeyEditSheetState extends State<_PixKeyEditSheet> {
  late PayoutPixKeyType _type;
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _type = widget.initialType;
    _controller = TextEditingController(text: widget.initialKey);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final key = _controller.text.trim();
    final error = key.isEmpty ? null : _type.validateKey(key);
    final canSave = key.length >= 5 && error == null;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Chave PIX de repasse',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<PayoutPixKeyType>(
            initialValue: _type,
            decoration: const InputDecoration(
              labelText: 'Tipo',
              border: OutlineInputBorder(),
            ),
            items: PayoutPixKeyType.values
                .map((t) => DropdownMenuItem(value: t, child: Text(t.label)))
                .toList(),
            onChanged: (t) => setState(() => _type = t ?? _type),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Chave',
              hintText: _type.hintForField(),
              errorText: error,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: canSave
                  ? () => Navigator.of(context).pop((_type, key))
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Salvar',
                  style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
