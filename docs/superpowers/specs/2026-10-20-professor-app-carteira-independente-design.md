# App do Professor — fase 3: carteira do professor independente (conta Asaas própria)

Continua `2026-10-20-professor-app-alunos-fase-1-design.md` (#811) e a fase 2 (#815). Canvas: "NexaGO
Professor - App Alunos" — B4, B14, B15, B16 (e a parte "carteira" de B2/B5). Decisão do dono
(20/10/2026): **o professor recebe numa conta Asaas própria**.

## Princípio

Na equipe da arena o dinheiro é da arena (fases 1–2). No independente o aluno é DO PROFESSOR: preço,
cobrança e dinheiro dele. A plataforma **não guarda esse dinheiro**: a cobrança é criada pela conta
NexaGO com **split** para a subconta do professor, o Asaas manda a parte dele direto para a conta
dele, e a NexaGO fica com a taxa. Sem carteira interna, sem saque nosso — o professor saca no Asaas.
A arena não vê alunos nem valores da carteira (só as reservas de quadra que ele faz).

## Decisões (padrão recomendado; revisar no PR)

### 1. Conta de recebimento = subconta Asaas "não-BaaS"

- O professor preenche no app: nome, CPF, e-mail, celular, data de nascimento, renda mensal
  (obrigatória no Asaas), CEP, endereço, número, bairro. A callable `createProfessorPayoutAccount`
  cria a subconta (`POST /v3/accounts`). **Pré-requisito: a conta-pai NexaGO no Asaas é CNPJ**
  (exigência do Asaas). Criar subconta pode ter custo no Asaas.
- O Asaas manda e-mail de ativação: o professor define a senha, envia os documentos e saca **no
  Asaas** (app/site deles). A tela explica isso.
- Gravamos `professorPayoutAccounts/{uid}` (o dono lê; só functions escrevem): `status`,
  `asaasAccountId`, `walletId`, nome, e-mail, CPF mascarado, `asaasEnv`, datas. A `apiKey` da
  subconta (só sai na criação) vai para `professorAsaasSecrets/{uid}` — **ninguém lê pelas rules**;
  serve só para a function consultar a situação (`GET /v3/myAccount/status`).
- Situação: `pending` (criada, aguardando ativação/documentos) → `approved` / `rejected`
  (`general` do status do Asaas). `refreshProfessorPayoutAccountStatus` relê ao abrir a tela.
  **Só cobra com `approved`** — split para conta não aprovada pode ser recusado/retido.
- Uma conta por professor (por ambiente Asaas). Trocar dados = falar com o suporte (fora do app).

### 2. Alunos da carteira

- `professors/{uid}/students/{athleteId}`: aluno **tem conta NexaGO** (busca de atleta, como nas
  Aulas). Nome/foto copiados na entrada; `status` active/archived; plano padrão opcional; cobrança
  recorrente opcional (`recurring: {planId, amountReais, dueDay}`).
- Escrita por callable (`upsertProfessorStudent`, `archiveProfessorStudent`); o dono lê pelas rules.
- Link de convite (aluno sem conta) fica para depois.

### 3. Planos e preços (B14)

- `professors/{uid}/plans/{planId}`: `name`, `kind` (`single` avulsa / `package` pacote /
  `monthly` mensal), `priceReais` (R$ 1–10.000), `classes` (aulas do pacote/mês, opcional),
  `validityDays` (pacote), `active`. Escrita por callable `upsertProfessorPlan`.

### 4. Cobrança (B15)

- `createProfessorCharge({athleteId, planId? | amountReais, description, dueDate, repeatMonthly})`:
  exige conta `approved` e aluno da carteira. Cliente Asaas = o do atleta (`users/{uid}/asaas/customer`,
  CPF do cadastro; **sem CPF, recusa** com mensagem para o aluno completar o cadastro).
- `POST /v3/payments`: `billingType: UNDEFINED` (fatura em que o aluno escolhe **PIX ou cartão**),
  `fine 2%`, `interest 1% a.m.`, `externalReference: professorCharge:{id}`, idempotência por id,
  **`split: [{walletId, percentualValue: 100 − taxa}]`**. O percentual do Asaas incide sobre o
  líquido (depois da tarifa do Asaas) — o professor arca com a tarifa do meio de pagamento, a NexaGO
  fica com a taxa.
- **Taxa NexaGO: 5%** (`PROFESSOR_CHARGE_FEE_PERCENT`, mesma do Elite/Clubinho), sem piso.
- `professorCharges/{id}`: professor (`professorUid`) e aluno (`athleteId`) leem; só functions
  escrevem. Campos: valor, descrição, vencimento, período, status `open`/`paid`/`canceled`/
  `refunded`, `invoiceUrl`, `paymentId`, `netReais` (quando pago).
- Aviso ao aluno: push `professor_charge_link` com o link da fatura. O aluno também vê a cobrança
  na lista de cobranças da agenda (`getMyClassCharges` passa a incluir as do professor, com o nome
  dele no lugar da arena — campo novo `source`, retrocompatível).
- `cancelProfessorCharge`: cancela no Asaas (`DELETE /v3/payments/{id}`) se ainda em aberto.
- **Recorrente** ("Repetir todo mês"): grava `recurring` no aluno; o agendador diário
  `generateProfessorMonthlyCharges` cria a cobrança do mês 5 dias antes do vencimento (uma por
  aluno/período, id determinístico).

### 5. Webhook

Prefixo novo `professorCharge:` no `asaasWebhook`. `RECEIVED`/`CONFIRMED` → `paid` (+`netReais`,
`paidAt`); `DELETED` → `canceled`; `REFUNDED`/chargeback → `refunded`; `OVERDUE` só espelha. O
dinheiro já foi para a subconta pelo split: não há crédito em carteira nossa.

### 6. Telas

- **Mais › Dinheiro**: "Receber pelo nexaGO" (conta), "Meus planos e preços" (B14), "Carteira própria"
  (B16). Os itens só aparecem para quem tem vínculo `INDEPENDENT` (ou já tem conta/carteira).
- **Conta** (nova): formulário → "Conta criada, confira seu e-mail" → situação (pendente/aprovada).
- **Alunos**: escopo "Carteira própria" na folha "Ver alunos de…"; alunos da carteira na lista com
  selo azul; "+" adiciona aluno (B5, só carteira nesta fase).
- **Aluno independente (B4)**: plano combinado, cobranças (pagas/abertas), "Cobrar" (B15).
- **Carteira própria (B16)**: recebido no mês (líquido), a receber, atrasados, "Lembrar" via
  WhatsApp com o link; custo de quadra do mês (reservas `bookedAs: professor`).

## Fora desta fase

B9 (nova aula independente reservando quadra) e B10 (turma própria com reserva recorrente),
lembrete automático, link de convite para quem não tem conta, NF, estorno pelo app.
