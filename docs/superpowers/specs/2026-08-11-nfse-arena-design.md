# NFS-e da arena para o cliente final — design

Data: 2026-08-11
Escopo: portal da arena (web), app Flutter e portal do atleta (leitura), backoffice.

## Problema

O atleta pede nota da reserva e ninguém emite. Hoje o produto não tem nenhuma
capacidade fiscal: não existe uma linha sobre nota fiscal nos 242 arquivos de
`functions/src/`, nem campo fiscal em nenhum portal.

A nota que falta é a do **prestador para o cliente final** — a arena emitindo
contra o atleta. Não é a nota da nexaGO sobre a taxa da plataforma, que é um
projeto separado e menor (ver "Fora de escopo").

## Decisões

| Decisão | Escolha |
|---|---|
| Emitente no v1 | Arena com CNPJ |
| Fatos geradores | Reserva de quadra e vaga de clubinho |
| Tipo de nota | NFS-e (serviço, ISS municipal) |
| Bar / comanda | Fora do v1 — é NFC-e, SEFAZ estadual (fase 2) |
| Organizador | Fora do v1 |
| Fornecedor | Emissor terceiro multi-CNPJ (Focus NFe ou PlugNotas) |
| Camada de pagamento | Intocada — conta Asaas única, carteira, repasse PIX |
| Gatilho | Toggle por arena: sempre / sob demanda / desligado |
| Pagamento no local | Baixa manual por callable, que também gera nota |
| Nota avulsa | Sim, recurso de primeira classe |
| Onboarding fiscal | Wizard no portal + chamado de ajuda no backoffice |

### Por que emissor terceiro e não subcontas Asaas

Subcontas Asaas (white label) resolveriam na raiz o incômodo de a nexaGO
receber o bruto na própria conta, com split nativo da comissão. Mas exigem
reescrever customers, cobranças, webhooks, carteiras, saques e estornos antes
da primeira nota sair, e ainda assim não cobrem a NFC-e do bar, porque o Asaas
só emite NFS-e (produto só via ERP Base by Asaas).

O emissor terceiro entrega nota rodando sem tocar na camada de pagamento, e
Focus NFe e PlugNotas fazem NFS-e, NFC-e e NF-e pela mesma API com vários CNPJs
numa conta só — o que compra a fase 2 do bar sem troca de fornecedor.

A escolha entre os dois fica para o plano de implementação, depois de um spike
comparando cobertura nos municípios das arenas reais e preço por volume. Ela não
bloqueia o design justamente porque `issuer-port` isola o fornecedor.

A migração para subcontas continua sendo a resposta certa se o contador disser
que o modelo de repasse com conta única não se sustenta. Esse design não a
impede: o módulo fiscal não conhece o gateway.

### Base de cálculo

A nota da arena é sempre pelo **valor bruto pago pelo cliente**, nunca pelo
líquido creditado na carteira. A taxa da plataforma (5–8%, piso R$1,50 —
`functions/src/platform-fees.ts`) é despesa da arena, coberta por nota da
nexaGO contra ela, em projeto separado.

Pagamento no local não passa pela nexaGO: não há taxa, não há repasse, e a nota
é da arena pelo bruto sem a plataforma na história.

## Arquitetura

Todo o fiscal vive em `functions/src/fiscal/`. Nada fora do módulo sabe qual é
o emissor.

| Arquivo | Responsabilidade |
|---|---|
| `issuer-port.ts` | Interface estreita: `getMunicipalRequirements`, `registerIssuer`, `issueServiceInvoice`, `cancelInvoice`, `getInvoice` |
| `issuer-client.ts` | Cliente HTTP do emissor, espelhando `functions/src/asaas-client.ts` (secret, base url, erro tipado). Único arquivo que sabe que é Focus ou PlugNotas |
| `arena-fiscal-config.ts` | Callables do wizard: ler exigências do município, salvar config, cadastrar serviços, emitir nota de teste |
| `invoice-emitter.ts` | Regra de "deve emitir?" e montagem do payload a partir da reserva, da sessão de clubinho ou da entrada avulsa |
| `invoice-processor.ts` | Trigger `onDocumentCreated` em `fiscalInvoices` que chama o emissor |
| `invoice-webhook.ts` | Recebe autorizada / rejeitada / cancelada do emissor |
| `invoice-cancellation.ts` | Cancelamento por cancelamento de reserva ou estorno de clubinho |
| `fiscal-alerts.ts` | Job diário: certificado vencendo, config em erro |

Trocar de fornecedor é escrever outra implementação de `issuer-port`. A NFC-e da
fase 2 entra pela mesma porta, sem tocar em quem consome.

### Pontos de acoplamento

A emissão automática engata onde a carteira é creditada:

- `functions/src/asaas-arena-booking-webhook.ts:155` — reserva
- `functions/src/asaas-arena-booking-webhook.ts:291` — fatia de split
- `functions/src/asaas-arena-club-webhook.ts:158` — clubinho
- callable novo `registerArenaBookingReceipt` — pagamento no local

Em nenhum deles a nota é emitida na hora. Cada um grava um documento em
`fiscalInvoices` com `status: 'requested'` e retorna. O trigger
`invoice-processor` faz a chamada ao emissor fora da transação da carteira:
prefeitura fora do ar não pode derrubar a confirmação de um pagamento.

## Dados

### `arenas/{arenaId}/fiscal/config`

Documento privado. Escrita só pelo Admin SDK, mesmo padrão de
`arenas/{arenaId}/billing/subscription`. As rules negam escrita direta do
gestor.

```
cnpj, razaoSocial, nomeFantasia
enderecoFiscal { logradouro, numero, complemento, bairro, municipio, uf, cep, codigoIbge }
inscricaoMunicipal
regimeTributario           // simples_nacional | lucro_presumido | lucro_real | mei
issuerId                   // id da arena dentro do emissor
credentialSecretName       // nome do secret no Secret Manager, nunca o valor
certificateExpiresAt       // para avisar antes de vencer
services[]                 // catálogo, ver abaixo
defaultServiceIdBooking    // serviço usado na emissão automática de reserva
defaultServiceIdClub       // serviço usado na emissão automática de clubinho
mode                       // always | on_demand | off
status                     // draft | testing | active | error
statusMessage              // motivo quando status = error
authorizationAcceptedAt    // aceite do termo, ver abaixo
authorizationAcceptedByUid
authorizationTermVersion
updatedAt
```

**Autorização para emitir em nome de terceiro.** A conta no emissor é da
nexaGO, e cada arena entra como uma empresa dentro dela — modelo padrão de
software house. O certificado da arena autentica, mas não substitui
consentimento: o wizard exige aceite expresso, registrado com autor, data e
versão do termo, antes de aceitar o certificado. Sem aceite, `status` não sai de
`draft`. Versionar o termo importa porque, quando o texto mudar, é preciso saber
quem aceitou qual.

`services[]`: `{ id, codigoMunicipal, descricao, aliquotaIss }`. Catálogo em vez
de código único porque locação de quadra e aula particular caem em itens
diferentes da LC 116 (3.03 e 8.02), com alíquotas potencialmente diferentes. A
emissão automática usa os `default*`; a nota avulsa escolhe da lista.

**Certificado A1 e senha de prefeitura não vão para o Firestore.** Um secret por
arena no Secret Manager, acessível só pela function de emissão. O Firestore
guarda apenas `credentialSecretName` e `certificateExpiresAt`.

### `fiscalInvoices/{invoiceId}`

Coleção top-level, como `arenaComandas`.

```
arenaId
origin                     // booking | club | manual
originId                   // bookingId, sessionId+participantId, ou null
idempotencyKey             // ver abaixo; única na coleção
serviceId, codigoMunicipal, aliquotaIss, descricao
tomador { nome, cpfCnpj, email?, endereco? }
tomadorUid                 // uid do atleta quando conhecido; null na avulsa
valorBrutoReais
status                     // requested | processing | authorized | rejected | cancelled | cancellation_failed
numero, serie, codigoVerificacao
pdfUrl, xmlUrl
errorMessage
requestedByUid             // preenchido quando veio de pedido do atleta
issuedByUid                // preenchido quando veio de nota avulsa
createdAt, processedAt, authorizedAt, cancelledAt
```

`idempotencyKey` é obrigatória e única: o webhook do Asaas repete, e nota
duplicada é problema fiscal, não bug de tela. Como é derivada muda por origem:

| Origem | Chave |
|---|---|
| Pagamento online | `payment:{asaasPaymentId}` |
| Recebimento no local | `receipt:{bookingId}:{receiptId}` |
| Avulsa | `manual:{invoiceId}` |

`tomadorUid` existe para as rules: sem ele não há como o atleta ler a própria
nota, já que `tomador.cpfCnpj` não identifica a conta.

### `arenaBookings/{bookingId}/receipts/{receiptId}`

Espelha `arenaComandas/{id}/payments`.

```
amountReais
method                     // cash | credit | debit | pix_direct | other
receivedAt
receivedByUid, receivedByName
note
```

### `arenas/{arenaId}/fiscalCustomers/{customerId}`

Tomadores frequentes, para a nota avulsa de mensalista e aluno de aula não
exigir redigitar CPF e endereço todo mês: `nome`, `cpfCnpj`, `email`,
`endereco`, `lastUsedAt`.

## Fluxos

### Emissão automática (pagamento online)

1. Webhook Asaas confirma o pagamento e credita a carteira, como já faz hoje.
2. Na sequência, fora da transação, `shouldAutoIssue()` decide. Só grava
   `fiscalInvoices` com `requested` se `mode === 'always'`. Com `on_demand` não
   grava nada — o documento nasce quando o atleta pedir, para a coleção não
   encher de pedido que nunca vira nota.
3. O trigger `invoice-processor` revalida "deve emitir?" (a config pode ter
   mudado entre a gravação e o processamento) e chama o emissor.
4. O webhook do emissor traz `authorized` com número, PDF e XML, ou `rejected`.

### Emissão automática (pagamento no local)

Hoje **não existe nenhum registro de que o dinheiro entrou**. `paymentStatus` só
chega a `"paid"` em quatro lugares, e os quatro são webhook de gateway
(`asaas-arena-booking-webhook.ts:108`, o do clubinho, o do Mercado Pago e o de
split). A reserva nasce com `paymentMode: "onsite"`
(`arena-booking-create.ts:33`), o cliente paga na maquininha da arena, e o
sistema nunca fica sabendo. E `onsitePaymentEnabled` vem ligado por padrão
(`arena-profile-repository.ts:42`).

O callable `registerArenaBookingReceipt` cria esse fato:

1. Valida o RBAC de `functions/src/arena-staff-roles.ts`.
2. Grava o `receipt` e atualiza `paymentStatus` e `amountDueOnsiteReais`.
3. Passa pelo mesmo `shouldAutoIssue()` do caminho online e, se for o caso,
   grava `fiscalInvoices` com `requested`.

**Regra dura: recebimento presencial não credita `arenaWallets`.** Esse dinheiro
nunca passou pela nexaGO; creditar faria a arena sacar saldo que não existe. A
carteira continua sendo só do online.

O padrão de escrita segue o de comanda (`comandas-repository.ts:378` registra
pagamento com método), mas como callable e não write direto do Angular, porque
agora tem consequência fiscal e precisa de auditoria e RBAC.

### Sob demanda

Com `mode: 'on_demand'` o pagamento não cria nota. O atleta vê "Pedir nota" na
reserva, no app e no portal do atleta, e o pedido cria o mesmo `requested` com
`requestedByUid`. Estando a config `active`, a emissão sai automática depois do
pedido — sem exigir clique da arena, senão vira fila parada e o atleta continua
sem nota.

### Nota avulsa

Formulário no portal da arena: tomador (da lista de `fiscalCustomers` ou novo),
serviço do catálogo, descrição livre, valor e data de competência. Gera
`fiscalInvoices` com `origin: 'manual'` e segue o mesmo caminho.

### Regra "deve emitir?"

Concentrada em `invoice-emitter.ts`, em duas funções:

`shouldAutoIssue()` — chamada nos pontos de acoplamento, decide se cria o
documento: `config.status === 'active'` e `config.mode === 'always'`.

`shouldProcess()` — chamada pelo trigger antes de bater no emissor:

- `config.status === 'active'` e `config.mode !== 'off'`
- a origem está efetivamente paga (pagamento confirmado ou recebimento
  registrado); avulsa dispensa esta checagem
- valor bruto > 0
- tomador com CPF/CNPJ válido
- não existe nota `authorized` com a mesma `idempotencyKey`

### Rejeição

`status: 'rejected'` com a mensagem crua do emissor, visível no portal, e retry
manual. Rejeição em sequência na mesma arena (credencial errada, inscrição
suspensa) muda `config.status` para `'error'` e notifica a arena. Sem isso, o
mês inteiro vira nota rejeitada em silêncio e ninguém percebe.

### Cancelamento e estorno

Reserva cancelada ou vaga de clubinho estornada
(`arena-club.ts:590`, `arena-club.ts:867`) com nota `authorized` → tenta
`cancelInvoice`.

A janela de cancelamento varia por município: algumas prefeituras aceitam até o
dia 10 do mês seguinte, outras 24h. Passada a janela, grava
`cancellation_failed` e avisa a arena de que precisa resolver com o contador por
nota de substituição. **Não fingir que cancelou.**

### Certificado

Job diário avisa 30, 15 e 7 dias antes de `certificateExpiresAt`. No vencimento,
`config.status = 'error'`.

## Telas

### Portal da arena (Angular, `frontend/projects/arena/src/app/painel/`)

- **`painel/fiscal/`** — wizard: consulta as exigências do município no emissor e
  monta o formulário só com os campos daquela cidade, colhe o aceite do termo de
  autorização, recebe certificado ou login da prefeitura, cadastra o catálogo de
  serviços, emite nota de teste e só então ativa. `status` da config sempre
  visível, com "preciso de ajuda" ao lado.
- **Aba Notas fiscais** dentro do financeiro existente (`painel/finance/`): lista
  com filtro de período e status, PDF e XML, reemitir, toggle sempre / sob
  demanda / desligado, e botão **Nova nota** para a avulsa.
- **Botão "Recebi no local"** no detalhe da reserva
  (`painel/bookings/panel-booking-detail.component.ts`, que hoje só mostra
  `paymentStatus` como texto morto), com valor, método e observação.

### Portal do atleta e app Flutter

Apenas na tela da reserva: link do PDF quando a nota está autorizada, e botão
"Pedir nota" quando a arena está em modo sob demanda.

### Backoffice

Fila dos chamados de ajuda do wizard, e visão global de notas rejeitadas por
arena — é por ali que se descobre que uma prefeitura mudou de regra antes de a
arena ligar reclamando.

## Segurança

- Certificado e senha de prefeitura só no Secret Manager, um secret por arena,
  lido apenas pela function de emissão. Nunca em Firestore, nunca em log.
- `arenas/{arenaId}/fiscal/config` com escrita negada nas rules; toda alteração
  passa por callable.
- `fiscalInvoices` legível pela arena dona e pelo tomador da nota; escrita só
  pelo Admin SDK.
- `registerArenaBookingReceipt` respeita o RBAC de `arena-staff-roles.ts` e
  registra quem deu a baixa.

## Testes

Padrão do projeto: `*.test.ts` rodando com
`npx ts-node --transpile-only`, com fake Firestore como em
`functions/src/arena-booking-split.test.ts`.

- Idempotência: webhook repetido não gera segunda nota
- "Deve emitir?" em cada combinação de `status` e `mode`
- Valor bruto correto quando houve split de pagamento ou desconto
- Baixa manual: RBAC, valor parcial, e que **não** credita a carteira
- Rejeição: marca `rejected`, e rejeição em sequência põe a config em `error`
- Cancelamento fora da janela vira `cancellation_failed`
- Nota avulsa com tomador novo e com tomador salvo

## Ordem de implementação

O escopo é grande demais para um plano só. Três fatias, cada uma entregável e
testável sozinha:

**A — Emitir.** `issuer-port` e `issuer-client`, config, wizard fiscal, emissão
automática do pagamento online, webhook do emissor, aba Notas fiscais no
financeiro. No fim desta fatia uma arena piloto já emite nota de reserva paga
online.

**B — Cobrir o resto do faturamento.** `registerArenaBookingReceipt` e o botão
"Recebi no local", nota avulsa com catálogo de serviços e `fiscalCustomers`,
modo sob demanda com o pedido do atleta no app e no portal.

**C — Operar.** Cancelamento e estorno, alertas de certificado, config em erro
por rejeição em sequência, e as telas de backoffice.

## Custo

Tabela da Focus NFe (agosto/2026):

| Plano | Mensal | CNPJs | Notas incluídas | Nota adicional |
|---|---|---|---|---|
| Solo | R$89,90 | 1 | 100 | R$0,10 |
| Start | R$113,90 | 3 (+R$37,90 por CNPJ) | 100 **por CNPJ** | R$0,10 |
| Growth | R$548,00 | ilimitados | 4.000 (bolo da conta) | R$0,12 |

O Solo não serve: um CNPJ só. A entrada é o **Start**, que cobre três arenas.

Projeção:

- piloto de 3 arenas × 300 notas/mês → R$173,90
- 5 arenas × 300 → R$289,70
- 20 arenas × 300 → R$788, ou **R$39 por arena**

O ponto de virada Start → Growth depende do volume, porque a franquia do Start é
por CNPJ e a do Growth é um bolo único: ~14 arenas se cada uma emite 100
notas/mês, ~10 se emite 300, ~7 se emite 500. Regra prática: **migrar por volta
de 10 arenas**.

A R$39 por arena o custo cabe dentro do preço do plano Pro e Parceiro, e deixa
de ser argumento contra o modo "emitir sempre". O toggle continua existindo pela
razão fiscal — emitir tudo significa ISS sobre 100% do declarado, e essa é uma
decisão da arena.

**Não habilitar "Recebimento de NFe/CTe/NFSe Nacional"**: na Focus, nota
*recebida* também consome unidade do pacote.

## Riscos

**Adoção é o risco maior, não o código.** O motivador é que hoje ninguém emite —
o que sugere que boa parte das arenas não tem inscrição municipal, certificado
nem processo fiscal montado. O wizard reduz o atrito, mas não cria cadastro que
não existe. Ligar a emissão significa ISS sobre 100% do faturamento declarado, e
para arena que hoje declara menos isso é motivo real para deixar desligado.

**Guardar certificado digital de terceiros é responsabilidade séria.** Um
vazamento permite emitir nota em nome da arena. Secret Manager não é detalhe de
implementação, é requisito.

**Cobertura municipal.** O emissor abstrai milhares de prefeituras, mas nem
todas, e cidades pequenas têm sistemas próprios instáveis. O wizard precisa
falhar de forma legível quando o município não é suportado, e o backoffice
precisa enxergar isso.

## Fora de escopo

- **NFC-e do bar** (fase 2): é SEFAZ estadual e ICMS, exige inscrição estadual,
  certificado A1 e CSC por estado, contingência offline, e classificação fiscal
  por produto — `ArenaProduct` (`painel/stock/product.model.ts:20`) não tem NCM,
  CFOP, CEST nem unidade comercial. Além disso boa parte da venda é dinheiro ou
  maquininha (`comanda.model.ts:62`) e nunca passa pelo gateway. O fornecedor
  escolhido no v1 já cobre NFC-e, então a fase 2 não troca de emissor.
- **Organizador**: `organizerWallets` é indexada por uid de pessoa, e boa parte
  dos organizadores é CPF. CPF não emite NFS-e por emissor automático.
- **Nota da nexaGO sobre a taxa e a assinatura**: projeto separado e menor —
  CNPJ único, município único, e o Asaas já emite NFS-e pela API. A taxa é
  descontada e nunca vira cobrança, então exige fechamento mensal agregando o
  ledger.
- **Emitir avulsa pelo app Flutter da arena**: v1 é só web.
- **Lista pronta de códigos de serviço por município**: o catálogo começa
  preenchido à mão no wizard.

## Referências

- Asaas — Notas Fiscais: https://docs.asaas.com/docs/notas-fiscais
- Focus NFe: https://focusnfe.com.br/
- PlugNotas: https://plugnotas.com.br/nfce/
