# NFS-e da arena — Fatia A.1: ativação real — design

Data: 2026-08-24
Escopo: Cloud Functions (`functions/src/fiscal/`), portal da arena (`frontend/projects/arena/`).

## Problema

A Fatia A ([spec](2026-08-11-nfse-arena-design.md), [plano](../plans/2026-08-11-nfse-arena-fatia-a.md)) entregou o wizard, o pipeline de emissão e a listagem de notas — mas nenhum código nela escreve `status: "active"` numa config fiscal. `saveArenaFiscalConfigCore` sempre grava `"testing"`; `shouldAutoIssue` exige `status === "active"`. Resultado: nenhuma arena consegue emitir nota de verdade. Achado pela revisão final de branch da Fatia A ([ledger da sessão](../plans/2026-08-11-nfse-arena-fatia-a.md), Critical #1), corrigido ali só na superfície (o texto da tela parou de mentir sobre um processo inexistente) — a ativação de verdade ficou para esta fatia, de propósito.

Junto, a mesma revisão apontou que a spec original pedia um botão "reemitir" para notas rejeitadas (§Telas, §Rejeição) que o plano da Fatia A deixou cair ao traduzir spec→plano. Este design resolve os dois de uma vez, porque são o mesmo mecanismo.

## Decisões

| Decisão | Escolha |
|---|---|
| O que significa "ativar" | Emitir uma nota fiscal real contra a homologação da Focus NFe, usando o cadastro que a arena preencheu. Autorizada → `active`; rejeitada → `error`. |
| Tomador da nota de teste | CPF sintético fixo, formato-válido, não-real, igual para toda arena. |
| Serviço da nota de teste | O `defaultServiceIdBooking` real da arena — prova o cadastro que vai valer de verdade, não um serviço à parte. |
| Valor | R$1,00 fixo. |
| Visibilidade na lista | Aparece na aba Notas fiscais com marcação clara de teste — nunca escondida, nunca confundida com venda real. |
| Mecanismo de ativação vs. subsistema isolado | Reaproveita o pipeline inteiro da Fatia A (`fiscalInvoices`, trigger, processor, webhook) — não duplica lógica já testada. |
| Reemitir | Nasce como consequência direta do mecanismo de ativação — mesmo miolo, exposto também como callable independente para qualquer nota `rejected`. |
| Permissão | Dono da arena, mesma regra (`assertManagesArena`) de toda ação fiscal já construída. |

## Arquitetura

Tudo em `functions/src/fiscal/`, seguindo a estrutura de módulos já criada na Fatia A. Dois arquivos novos:

| Arquivo | Responsabilidade |
|---|---|
| `activation.ts` | `emitActivationTestInvoice` (callable) e o trigger de promoção `onActivationTestInvoiceResolved` |
| `invoice-retry.ts` | O primitivo compartilhado `reprocessFiscalInvoice` e o callable `retryFiscalInvoice` |

Nenhum arquivo da Fatia A é reescrito — só estendido:

- `types.ts`: `FiscalInvoiceOrigin` ganha `"activation_test"`.
- `invoice-emitter.ts`: dois ajustes em `shouldProcess`, não um.
  1. **Checagem de pagamento** — pula para `"activation_test"`, igual já faz para `"manual"` (isso já estava no design original).
  2. **Checagem de status da config — achado na revisão deste documento, não estava no design original.** O primeiro `if` de `shouldProcess` hoje é `if (!config || config.status !== "active" || config.mode === "off")`. Isso bloquearia *toda* nota de ativação: ela roda exatamente enquanto `status` ainda é `"testing"` (ou `"error"`, no reemitir) — nunca `"active"`, porque é ela quem produz esse estado. Sem esse ajuste, `emitActivationTestInvoice` chamaria `createInvoiceRequest` normalmente, mas o trigger rejeitaria a nota na hora com `CONFIG_NOT_EMITTING`, antes de qualquer chamada ao emissor. `mode` também não se aplica aqui — é irrelevante para uma emissão disparada manualmente pelo dono, não pelo pagamento automático. A checagem vira:
     ```typescript
     if (input.origin === "activation_test") {
       if (!config || (config.status !== "testing" && config.status !== "error")) {
         return {ok: false, reason: "CONFIG_NOT_EMITTING"};
       }
     } else if (!config || config.status !== "active" || config.mode === "off") {
       return {ok: false, reason: "CONFIG_NOT_EMITTING"};
     }
     ```
- `invoice-processor.ts`: `isOriginPaid` retorna `true` para `"activation_test"`, mesma linha de raciocínio da checagem de `"manual"`.
- `invoice-repository.ts`: `invoiceIdFor` passa a ser exportado (hoje é local, não exportado) — `activation.ts` precisa calcular o id determinístico da nota de teste sem duplicar a fórmula.
- `index.ts`: exporta os dois callables novos e o trigger novo.

## Dados

Nenhuma coleção nova. `fiscalInvoices` ganha um padrão de uso, não um campo novo: uma nota com `origin: "activation_test"` é sempre a nota de teste da arena, e existe no máximo uma por arena (garantido pelo id determinístico abaixo).

### Id determinístico da nota de teste

`idempotencyKey` da nota de ativação: `` `activation:${arenaId}` ``. Via a mesma fórmula de `invoiceIdFor` (`` `${arenaId}__${idempotencyKey}` ``, barra virando underscore), o id do documento é sempre `` `${arenaId}__activation:${arenaId}` `` — recalculável sem query, o que é o que permite `emitActivationTestInvoice` decidir "criar" vs. "reemitir" com um único `db.doc(id).get()`.

`buildIdempotencyKey` (`invoice-emitter.ts`) ganha a variante:

```typescript
export type IdempotencyInput =
  | {origin: FiscalInvoiceOrigin; asaasPaymentId: string}
  | {origin: FiscalInvoiceOrigin; bookingId: string; receiptId: string}
  | {origin: "manual"; invoiceId: string}
  | {origin: "activation_test"; arenaId: string};
```

**Atenção na implementação**: a função atual distingue os casos por `"campo" in input`, não por `origin`, e a variante `"manual"` de hoje é o `else` final (`return \`manual:${input.invoiceId}\`;`). A variante nova precisa de um `if ("arenaId" in input)` **antes** desse `else` — senão ela cai por engano no ramo de `"manual"`, porque nem `asaasPaymentId` nem `receiptId` estão presentes em nenhuma das duas. Achado na auto-revisão deste documento; não é ambíguo, mas é fácil de errar copiando o padrão existente sem notar o `else` implícito:

```typescript
export function buildIdempotencyKey(input: IdempotencyInput): string {
  if ("asaasPaymentId" in input) return `payment:${input.asaasPaymentId}`;
  if ("receiptId" in input) return `receipt:${input.bookingId}:${input.receiptId}`;
  if ("arenaId" in input) return `activation:${input.arenaId}`;
  return `manual:${input.invoiceId}`;
}
```

## Fluxos

### `emitActivationTestInvoice({arenaId})`

1. `assertManagesArena(db, arenaId, callerUid)` — mesma checagem de `arena-fiscal-config.ts`.
2. Lê a config; recusa (`failed-precondition`) se não existir ou se `status` não for `"testing"` nem `"error"` (ativar só faz sentido nesses dois estados — `"active"` já passou, `"draft"` ainda não tem cadastro).
3. Calcula o id determinístico da nota (`invoiceIdFor(arenaId, "activation:" + arenaId)`) e lê o documento.
4. **Não existe** → monta o `CreateInvoiceRequestInput` (tomador sintético, serviço `defaultServiceIdBooking`, `valorBrutoReais: 1`, `origin: "activation_test"`, `originId: null`) e chama `createInvoiceRequest` — igual a qualquer nota. O trigger `onFiscalInvoiceRequested` da Fatia A processa normalmente, sem nenhuma peça nova aqui.
5. **Existe e está `"rejected"`** → chama `reprocessFiscalInvoice` (ver abaixo) sobre esse id — este é o caminho de "tentar de novo depois de corrigir o cadastro".
6. **Existe e está `"authorized"`, `"requested"` ou `"processing"`** → não faz nada, devolve o estado atual (idempotente: reclicar não duplica nem interrompe um processamento em andamento).

### `reprocessFiscalInvoice(db, issuer, readToken, invoiceId)` — o primitivo compartilhado

Vive em `invoice-retry.ts`, importado tanto por `activation.ts` quanto pelo callable `retryFiscalInvoice`.

```typescript
export async function reprocessFiscalInvoice(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  await db.doc(`fiscalInvoices/${invoiceId}`).set(
    {status: "requested", errorMessage: null, processedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  await processInvoiceRequest(db, issuer, readToken, invoiceId);
}
```

O reset para `"requested"` é obrigatório antes de chamar `processInvoiceRequest`: essa função tem `if (invoice.status !== "requested") return;` logo no início (Fatia A, `invoice-processor.ts`) — sem o reset, a chamada direta seria um no-op silencioso. E a chamada precisa ser direta porque `onFiscalInvoiceRequested` é um trigger de **criação** de documento (`onDocumentCreated`) — não dispara em atualização, então nada re-processaria a nota sozinho.

### `retryFiscalInvoice({arenaId, invoiceId})`

1. `assertManagesArena(db, arenaId, callerUid)`.
2. Lê a nota; recusa (`not-found`) se não existe ou não pertence a `arenaId`; recusa (`failed-precondition`) se `status !== "rejected"` — `"cancellation_failed"` fica de fora de propósito, é rota do contador (nota de substituição), não um simples reemitir.
3. Chama `reprocessFiscalInvoice` com o mesmo `issuer`/`readToken` que o trigger usa (mesma construção de `FocusNfeIssuer` a partir de `FOCUS_ENV`/`FOCUS_ACCOUNT_TOKEN`, mesma `readIssuerTokenFromSecretManager`).

### Trigger de promoção — `onActivationTestInvoiceResolved`

`onDocumentUpdated("fiscalInvoices/{invoiceId}")`. Dispara em toda atualização de qualquer nota fiscal (o Firestore não filtra triggers por valor de campo) — sai imediatamente se `event.data.after.data().origin !== "activation_test"`. Custo extra por nota real é uma leitura de campo e um retorno; desprezível no volume da Fatia A, vale registrar como nota de arquitetura, não como bloqueio.

Quando dispara para de fato uma nota de ativação, e o `status` mudou:

- Para `"authorized"` → `arenas/{arenaId}/fiscal/config.status = "active"`.
- Para `"rejected"` → `arenas/{arenaId}/fiscal/config.status = "error"`, `statusMessage = invoice.errorMessage`.

Isso dá uso real ao estado `"error"` e ao campo `statusMessage`, que o tipo `ArenaFiscalConfig` e as duas telas da Fatia A já tinham — só que nada escrevia neles até agora.

## Telas

### Wizard, passo 5 (`panel-fiscal.component.ts`)

- `status: "testing"` → botão "Emitir nota de teste", chama `emitActivationTestInvoice`. Texto explica que uma nota real de R$1,00 vai ser enviada à prefeitura em homologação.
- `status: "error"` → mostra `statusMessage` (a mensagem real, já traduzida para português pela Fatia A — Fix 6 da revisão final) e o mesmo botão, relabelado "Tentar novamente".
- `status: "active"` → mantém a tela de sucesso já existente.

Corrige de vez a cópia que ficou pendente do lado de fora do escopo da correção da Fatia A (`panel-fiscal-invoices.component.ts:~107-110` e o caso `"active"` deste mesmo arquivo) — agora a história que essas telas contam é verdadeira, porque o processo que elas descrevem passa a existir.

### Notas fiscais (`panel-fiscal-invoices.component.ts`)

- Toda nota com `status: "rejected"` ganha um botão "Reemitir" chamando `retryFiscalInvoice({arenaId, invoiceId: item.id})`.
- Toda nota com `origin: "activation_test"` ganha uma etiqueta "Teste" visível na linha — nunca escondida da lista, nunca no mesmo estilo visual de uma venda real.

## Segurança

Mesma regra de toda ação fiscal da Fatia A: só o `managerUserId` da arena (ou superadmin) pode chamar `emitActivationTestInvoice`/`retryFiscalInvoice`. Nenhum dado novo sensível — a nota de teste usa CPF sintético, não certificado nem senha.

## Testes

Padrão da Fatia A: `node:test` + `FakeFirestore`/`FakeIssuer`.

- `emitActivationTestInvoice`: cria quando não existe nota de teste; reemite quando existe e está `rejected` (assert que `processInvoiceRequest`/o issuer foi chamado de novo); no-op quando `authorized`/`requested`/`processing`; recusa fora de `testing`/`error`.
- `reprocessFiscalInvoice`: reseta `status`/`errorMessage` antes de chamar `processInvoiceRequest`; propaga o resultado do issuer corretamente.
- `retryFiscalInvoice`: recusa nota de outra arena; recusa `status !== "rejected"`; RBAC dono-only.
- Trigger de promoção: `authorized` → config vira `active`; `rejected` → config vira `error` com `statusMessage`; ignora atualização de nota com `origin` diferente de `"activation_test"`.
- `shouldProcess`/`isOriginPaid`: `"activation_test"` passa sem checagem de pagamento, mesmo padrão de `"manual"`; e passa com `config.status` em `"testing"`/`"error"` mesmo sem `"active"` (o ajuste achado nesta revisão) — cobrir também o caso negativo, `config.status === "draft"` continua bloqueado.
- Frontend: specs dos dois componentes cobrindo os estados novos (botão de emitir/tentar de novo, botão de reemitir, etiqueta de teste).

## Fora de escopo

- **Nota avulsa de verdade** (Fatia B) — o `origin: "activation_test"` é deliberadamente distinto de `"manual"`; este design não constrói a tela de nota avulsa nem o cadastro de `fiscalCustomers`.
- **Cancelamento** (`status: "cancellation_failed"` e a rota do contador) — Fatia C, inalterado.
- **Verificação do contrato real da Focus** — continua não validado contra homologação de verdade (mesma lacuna documentada em `FISCAL.md` desde a Fatia A). Este design assume que uma nota autorizada em homologação chega pelo mesmo webhook (`applyIssuerNotification`) que qualquer outra — se o contrato real divergir, é o mesmo risco já conhecido, não um novo.
- **Cooldown/limite de tentativas de reemitir** — decisão deliberada de não construir: é uma ação manual do dono, não automática: o risco de martelar a Focus com o mesmo CNPJ errado repetidamente é limitado pelo comportamento humano, não pelo sistema.

## Referências

- Spec da Fatia A: [2026-08-11-nfse-arena-design.md](2026-08-11-nfse-arena-design.md)
- Plano da Fatia A: [2026-08-11-nfse-arena-fatia-a.md](../plans/2026-08-11-nfse-arena-fatia-a.md)
