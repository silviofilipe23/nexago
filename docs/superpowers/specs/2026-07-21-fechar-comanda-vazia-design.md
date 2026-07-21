# Fechar comanda vazia (web + Flutter)

## Problema

Quando uma comanda é aberta e nenhum item é lançado (`totalCents == 0`), não existe
nenhuma forma de fechá-la ou removê-la da lista de comandas abertas — nem no painel
web (Angular) nem no app Flutter. A comanda fica "presa" em aberto indefinidamente.

Causa raiz: o único caminho que hoje leva uma comanda a `status: closed` é
`registerPayment` atingir `paidCents >= totalCents`. Como o botão de pagamento só
aparece quando há saldo a pagar (`remainingCents > 0`), uma comanda com total zero
nunca tem o botão de pagamento exibido — e nenhuma outra ação de fechamento existe.

## Restrição de plataforma

`firestore.rules` bloqueia exclusão real da coleção `arenaComandas` para todo mundo:

```
match /arenaComandas/{comandaId} {
  ...
  allow delete: if false;
}
```

Abrir uma exceção de `delete` exigiria mudança de segurança em toda a coleção, e o
projeto já usa o padrão de "soft state" em vez de exclusão física em outros lugares
(ex.: produtos usam `active: false` em vez de apagar o documento).

## Decisão

Reaproveitar o status `closed` já existente em vez de criar um novo status
(`canceled`) ou abrir exclusão real. Uma comanda vazia (`totalCents == 0` e status
ativo) ganha uma ação "Fechar comanda" que grava `status: closed` diretamente —
sem criar pagamento, sem tocar em `paidCents` (permanece `0`).

Isso satisfaz tanto "fechar" quanto "excluir" do pedido original: a comanda some da
lista de abertas e do faturamento (contribui `R$0,00`), sem exigir mudança nas
regras do Firestore em nenhuma das duas plataformas — a regra de update já permite
a transição pra `closed` quando `paidCents >= totalCents`, o que é trivialmente
verdadeiro em `0 >= 0`.

Escopo: implementar nas duas plataformas (web e Flutter), já que o mesmo gap existe
nos dois repositórios de comanda.

## Design — Web (Angular, `frontend/projects/arena`)

### `src/app/painel/orders/comanda.model.ts`

Nova função guarda, no mesmo estilo de `comandaItemReverseBlockReason`:

```ts
export function comandaCloseEmptyBlockReason(
  comanda: Pick<ArenaComanda, 'status' | 'totalCents'>,
): string | null {
  if (!comandaStatusIsActive(comanda.status)) {
    return 'Comanda já não está aberta.';
  }
  if (comanda.totalCents !== 0) {
    return 'Comanda tem consumo lançado — registre o pagamento para fechar.';
  }
  return null;
}
```

### `src/app/painel/orders/comandas-repository.ts`

Nova função `closeEmptyComanda(db, comandaId)`, no mesmo padrão de `registerPayment`
(transaction, valida existência + `comandaStatusIsActive` + `totalCents === 0`,
grava `{ status: 'closed', updatedAt: serverTimestamp() }`).

### `src/app/painel/orders/panel-order-detail.component.ts`

- Importar `ModalComponent` (ainda não usado neste componente).
- No card da coluna direita, adicionar um terceiro ramo além de `canPay()` /
  `status === 'closed'`: quando `comandaCloseEmptyBlockReason(c)` é `null`, mostrar
  um card "Fechar comanda" com texto explicativo e um botão (`ar-mini-btn`, não o
  `.close-btn` laranja de pagamento — essa ação não é a via "desejada" de fechar
  comanda, é housekeeping) que abre um modal de confirmação.
- Modal de confirmação segue o padrão de "Remover produto?" em
  `panel-stock-detail.component.ts` (`ar-modal` + `.confirm-title` /
  `.confirm-body` / `.confirm-actions`, com botão "Cancelar" ghost e botão de
  confirmação primary).
- Ao confirmar: chama `closeEmptyComanda`, recarrega a comanda (`loadAll`), trata
  erro com o mesmo padrão de `payError`/`itemError` já usados na tela.
- Ajuste de texto: quando `c.status === 'closed' && c.totalCents === 0`, mostrar
  "Comanda fechada sem consumo." em vez de "Comanda fechada — totalmente paga."

Nenhuma mudança em `firestore.rules` nem em Cloud Functions.

## Design — Flutter (`nexago_app`)

### `lib/features/arena/data/arena_comandas_repository.dart`

Novo método na classe `ArenaComandasRepository`, logo após `registerPayment`
(linha ~504):

```dart
Future<ArenaComanda> closeEmptyComanda({required String comandaId}) async {
  final managerUid = _auth.currentUser?.uid;
  if (managerUid == null || managerUid.isEmpty) {
    throw StateError('Usuário não autenticado.');
  }

  final comandaRef = _comandas.doc(comandaId.trim());
  late ArenaComanda updated;

  await _firestore.runTransaction((txn) async {
    final comandaSnap = await txn.get(comandaRef);
    if (!comandaSnap.exists) {
      throw StateError('Comanda não encontrada.');
    }
    final comanda = ArenaComanda.fromFirestore(comandaSnap);
    if (!comanda.status.isActive) {
      throw StateError('Comanda não está aberta.');
    }
    if (comanda.totalCents != 0) {
      throw StateError('Comanda tem consumo lançado.');
    }

    txn.update(comandaRef, {
      'status': ArenaComandaStatus.closed.firestoreValue,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    updated = comanda.copyWith(status: ArenaComandaStatus.closed);
  });

  return updated;
}
```

(`copyWith` já existe na extension privada do arquivo — só precisa aceitar
`status` sem `paidCents`, o que já é suportado.)

### `lib/features/arena/domain/comandas/arena_comanda_logic.dart`

Helper de gating equivalente ao do web, ao lado de
`comandaItemReverseBlockReason`/`canReverseComandaItem` (linhas ~376-399):

```dart
bool canCloseEmptyComanda(ArenaComanda comanda) =>
    comanda.status.isActive && comanda.totalCents == 0;
```

### `lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart`

- Hoje (linha 46): `final canClose = comanda.totalCents > 0;` deixa o `FilledButton`
  "Fechar conta →" (linhas 163-188) com `onPressed: null` (desabilitado, cinza)
  quando a comanda está vazia — é exatamente esse estado travado que o usuário
  reportou.
- Adicionar `final canCloseEmpty = canCloseEmptyComanda(comanda);` e trocar o
  `onPressed`/label do botão:
  - `canClose` → comportamento atual (navega pra `arenaComandaPayment`).
  - `canCloseEmpty` (novo) → botão fica habilitado com label "Fechar comanda",
    abre um `AlertDialog` de confirmação "Fechar comanda sem consumo?" (mesmo
    padrão do `_confirmReverse` em `arena_comanda_items_section.dart`), e ao
    confirmar chama `ref.read(arenaComandasRepositoryProvider).closeEmptyComanda(...)`
    e navega via `context.pushReplacementNamed(AppRouteNames.arenaComandaClosed,
    pathParameters: {'comandaId': comandaId}, extra: ArenaComandaClosedArgs(comanda:
    updated, payments: const []))` — a mesma tela de "comanda fechada" usada após
    pagamento total, que já lida bem com lista de pagamentos vazia.
  - Nenhum dos dois → estado atual (desabilitado).

Nenhuma mudança em `firestore.rules` nem em Cloud Functions.

## Fora de escopo

- Reabrir uma comanda fechada por engano (não existe hoje pra nenhum status;
  se necessário, o gestor abre uma nova comanda).
- Fechar/cancelar comandas com consumo lançado mas sem pagamento (esse fluxo já
  é resolvido pelo pagamento normal; não é o problema reportado).
- Qualquer mudança em `firestore.rules` ou Cloud Functions.

## Testes

- Web: módulo `orders` não tem testes automatizados hoje — verificação manual no
  navegador (comanda vazia → botão aparece, fecha, some da lista de abertas;
  comanda com item lançado → botão não aparece).
- Flutter: `test/features/arena/comandas/arena_comanda_logic_test.dart` já cobre
  `arena_comanda_logic.dart` — adicionar casos pra `canCloseEmptyComanda` ali
  (comanda aberta + total zero → `true`; com consumo → `false`; já fechada →
  `false`). Não há teste de `arena_comandas_repository.dart` hoje (transactions
  não são testadas via unit test nesse módulo) — `closeEmptyComanda` fica sem
  cobertura automatizada, mesmo padrão de `registerPayment`/`addItemsBatch`.
