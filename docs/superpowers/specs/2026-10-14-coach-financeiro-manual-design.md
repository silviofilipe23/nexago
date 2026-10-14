# Financeiro do treinador — controle manual de mensalidades (fase 1) — design

## Contexto

O portal do treinador (`frontend/projects/coach`) atende escolinhas de esportes de quadra de areia. Hoje as
telas de Financeiro (Pagamentos, Planos, Novo plano) são **protótipos com dados fixos**, sem Firestore: o
professor "cria um plano" ou vê "João Silva, R$ 180, pago" e nada persiste. Mensalidade é a dor central de uma
escolinha, então este é o buraco mais caro do MVP (relatório de varredura de 14/10/2026).

A plataforma já tem Asaas (PIX, cartão, assinaturas, webhooks), carteiras e saque para arenas e organizadores,
mas **não há carteira, chave PIX de repasse nem taxa para treinador**. Montar isso junto seria grande (KYC,
repasse, taxa, webhook). Decisão do dono: **fase 1 = livro-caixa manual**; cobrança online fica para a fase 2,
sobre o mesmo modelo de dados.

## Decisões

- **Fase 1 é controle manual.** O professor cria planos, matricula alunos, o sistema gera as parcelas com
  vencimento e o professor **dá baixa** (pago em Pix/dinheiro/cartão direto com ele). Sem Asaas, taxa, carteira
  nem webhook. O nexaGO **não processa** esses pagamentos — a tela diz isso.
- **Abordagem A: parcelas materializadas.** Cada parcela é um documento. Alternativas descartadas:
  (B) Cloud Function agendada — exige backend, agendador e cuidado com duplicidade desde o MVP para algo que no
  modo manual não precisa ser automático; (C) só matrículas + recibos com o "devido" calculado — desconto,
  vencimento ajustado e parcela perdoada viram exceções difíceis de guardar e rendem pouco para a fase 2.
- **O aluno é um atleta nexaGO com conta** (decisão anterior do projeto). Não há aluno "sem conta".
- **O aluno não vê nada na fase 1.** Ver as próprias mensalidades exigiria regra de leitura cross-user e
  telas no app/portal do atleta: fica para a fase 2.
- **Um plano ativo por aluno.** A matrícula tem o uid do atleta como id.
- **O Financeiro olha a escola inteira**, sem filtrar pela equipe ativa da sidebar — senão a mensalidade de um
  aluno "some" quando o professor troca de equipe.
- **Ciclo `avulso` fica de fora.** Sem uma "cobrança solta" ele não tem uso; entra junto com ela numa fase
  seguinte. Ciclos do MVP: `mensal`, `trimestral`, `anual`.
- **Valores em centavos inteiros** (`amountCents`), nunca em ponto flutuante.
- **"Atrasado" não é gravado:** é `pendente` com `dueDate` anterior a hoje no fuso local, calculado na leitura.
- **Compatível com o RBAC de comissão técnica** (`2026-10-14-coach-comissao-tecnica-rbac-design.md`), onde
  `financeiro` é área só do treinador principal: as regras são *owner-only* hoje e o uid do treinador passa por
  **um único ponto** no serviço (`requireUid()`, como em `TrainingsService`), que o RBAC troca por
  `activeCoachUid()`. As três coleções são a área `financeiro` dessa matriz.

## Modelo de dados

Três coleções sob `coaches/{coachUid}/`, só do dono.

### `plans/{planId}`

| Campo | Tipo | Nota |
|---|---|---|
| `name` | string | obrigatório |
| `amountCents` | int > 0 | valor por ciclo |
| `cycle` | `'mensal' \| 'trimestral' \| 'anual'` | |
| `description` | string | |
| `active` | bool | plano inativo não aceita matrícula nova; matrículas existentes continuam |
| `createdAt`, `updatedAt` | timestamp | |

Plano não é excluído, só desativado (parcelas e matrículas referenciam o `planId`).

### `enrollments/{athleteUid}`

| Campo | Tipo | Nota |
|---|---|---|
| `athleteUid` | string | igual ao id do doc: garante um plano ativo por aluno |
| `athleteName` | string | cópia do nome na hora, para o histórico sobreviver ao aluno sair da equipe |
| `planId` | string | |
| `startDate` | `YYYY-MM-DD` | |
| `dueDay` | int 1–28 | dia do vencimento |
| `status` | `'ativa' \| 'encerrada'` | |
| `createdAt`, `endedAt?` | timestamp | |

### `charges/{chargeId}`

| Campo | Tipo | Nota |
|---|---|---|
| `athleteUid`, `athleteName` | string | nome copiado, como na matrícula |
| `planId`, `planName` | string | `planName` copiado na hora |
| `periodKey` | `YYYY-MM` | mês do `dueDate`; evita parcela duplicada por aluno |
| `amountCents` | int > 0 | valor cobrado; o professor pode ajustar (desconto) |
| `dueDate` | `YYYY-MM-DD` | |
| `status` | `'pendente' \| 'pago' \| 'cancelado'` | |
| `paidAt?` | `YYYY-MM-DD` | só em `pago` |
| `method?` | `'pix' \| 'dinheiro' \| 'cartao' \| 'outro'` | só em `pago` |
| `note?` | string | |
| `createdAt`, `updatedAt` | timestamp | |

Fase 2 acrescenta `asaasPaymentId` e `paymentChannel` ao mesmo doc, sem migração.

### Estado derivado (`chargeState`)

`pago` → "Pago"; `cancelado` → "Cancelado"; `pendente` com `dueDate < hoje` (fuso local) → "Atrasado";
`pendente` caso contrário → "Pendente". Hoje vem de `localIsoDate()` (já existe em `training-rules.ts`).

### Geração de parcelas (`generateCharges`)

Entrada: plano, matrícula (`startDate`, `dueDay`), quantas parcelas, e os `periodKey` já existentes do aluno.

- Passo do ciclo: mensal = 1 mês, trimestral = 3, anual = 12. Quantidade padrão: 12 mensais, 4 trimestrais,
  1 anual.
- **Primeiro vencimento:** o `dueDay` (limitado ao último dia do mês) no mês de `startDate`; se isso cair
  **antes** de `startDate`, vai para o mês seguinte.
- Demais vencimentos: somam o passo do ciclo, com o dia **recalculado** a cada mês (dia 28 sempre existe;
  `dueDay` até 28 evita meses curtos, mas a função também limita ao último dia do mês por segurança).
- `periodKey` = `YYYY-MM` do vencimento; parcelas cujo `periodKey` já existe são puladas.
- "Gerar próximos" continua a partir do período seguinte ao último existente do aluno.
- Cada parcela nasce `pendente` com `amountCents` = valor do plano **no momento** (cópia; mudar o plano depois
  não altera parcelas já geradas — a tela avisa).

### Ações de matrícula

- **Matricular:** grava `enrollments/{athleteUid}` + parcelas num único `writeBatch`.
- **Gerar próximos:** só parcelas novas, pelo mesmo critério de `periodKey`.
- **Trocar plano:** parcelas **pagas** e **vencidas** (pendentes com `dueDate < hoje`) ficam como estão; as
  pendentes com `dueDate >= hoje` do plano antigo são **canceladas** e substituídas por uma série nova do plano
  novo a partir do próximo vencimento. Pede confirmação inline.
- **Encerrar matrícula:** `status = 'encerrada'` e cancela as pendentes com `dueDate >= hoje`; pagas, vencidas e
  histórico ficam. Pede confirmação inline.
- Um aluno com matrícula `encerrada` pode ser matriculado de novo (o doc é regravado como `ativa`).

## Telas

Rotas existentes: `painel/financeiro` (Pagamentos), `painel/financeiro/planos`, `painel/financeiro/planos/novo`.
Novas: `painel/financeiro/planos/:id/editar` e `painel/financeiro/matricular`. Padrão visual e responsivo do
painel; páginas novas usam `var(--co-gutter, 32px)` (com valor padrão) para funcionarem com ou sem o shell
responsivo. Aviso fixo em Pagamentos: "Controle interno de mensalidades. O nexaGO não processa esses pagamentos."

### Planos
Lista do Firestore: nome, valor, ciclo, alunos matriculados, selo ativo/inativo. KPIs: planos ativos, alunos
matriculados, **receita mensal prevista** (soma das matrículas `ativa`: mensal = valor, trimestral = valor/3,
anual = valor/12, arredondado para centavo). Ações: Editar, Desativar/Reativar. Vazio: "Crie seu primeiro plano".

### Novo / editar plano
Nome, valor (campo em reais → centavos), ciclo, descrição. A "Cobrança automática" do protótipo **sai** na fase 1.
Ao editar o valor: "As parcelas já geradas não mudam."

### Matricular aluno
Campos: aluno (atletas do treinador), plano (só ativos), data de início (padrão: hoje), dia do vencimento
(padrão: dia do início limitado a 28), quantidade de parcelas. Prévia ao vivo: "Vai gerar 12 parcelas de
R$ 180,00 · 05/11 a 05/10". Com `?aluno=<uid>` e matrícula existente, a tela mostra o plano atual e o último
período gerado, com **Gerar próximos**, **Trocar plano** e **Encerrar matrícula**.

### Pagamentos
Seletor de mês (padrão: atual; filtra por `dueDate`). KPIs, definidos por competência (vencimento no mês):
- **Recebido:** parcelas `pago` com `dueDate` no mês.
- **A receber:** parcelas `pendente` com `dueDate` no mês e `dueDate >= hoje`.
- **Em atraso:** **todas** as `pendente` vencidas, de qualquer mês (quantidade e valor).

Abas: Todos, Pendentes, Atrasados, Pagos. Cada linha: aluno, plano, vencimento, valor, selo. Ações inline na
linha, sem modal (mesmo padrão da exclusão de treino):
- **Dar baixa:** método, data (padrão: hoje), nota opcional → `pago`.
- **Editar parcela:** valor e vencimento (só `pendente`).
- **Cancelar parcela:** → `cancelado`.
- **Desfazer baixa:** `pago` → `pendente` (remove `paidAt`/`method`/`note`).
- **Copiar cobrança** (só atrasadas): copia "Olá! Lembrando da mensalidade de R$ 180,00, com vencimento em
  05/11." para a área de transferência. Substitui o "Cobrar" do protótipo.

Links: "Matricular aluno" no topo; "Matrícula" em cada linha → `matricular?aluno=<uid>`.

Estados: carregando, vazio, erro. Todo botão que grava fica desabilitado enquanto salva, e toda gravação tem
`catch` com alerta. O serviço expõe `ready` e `error`: regra não publicada vira "sem permissão", nunca lista
vazia que parece "ninguém deve nada".

## Arquitetura de código

Em `painel/financeiro/`, no padrão de `painel/treinos/`:

- `finance-model.ts` — `Plan`, `Enrollment`, `Charge` e leitores defensivos.
- `finance-rules.ts` — **funções puras**: `toCents`/`fromCents`/`formatBRL`, `generateCharges`, `chargeState`,
  `monthTotals`, `monthlyEquivalentCents`, `collectionMessage`, limites de mês. Com spec.
- `finance.service.ts` — `FinanceService`:
  - Leitura: `plans` e `enrollments` inteiros (pequenos); `charges` em **dois listeners** — o mês visível
    (faixa de `dueDate`, índice automático) e as **pendentes vencidas** (`status == 'pendente'` e
    `dueDate < hoje`, índice composto). Evita reler o histórico inteiro a cada sessão.
  - Escrita: `createPlan`, `updatePlan`, `setPlanActive`, `enroll`, `generateMore`, `changePlan`,
    `endEnrollment`, `markPaid`, `undoPaid`, `editCharge`, `cancelCharge`. As que tocam várias parcelas usam
    `writeBatch` (≤ ~50 docs, abaixo do limite de 500). `generateMore` lê uma vez os `periodKey` do aluno
    (`where('athleteUid','==',…)`, índice automático) para deduplicar.
  - `requireUid()` único (ponto de troca do RBAC) e sinais `ready`/`error`.
- Telas: reescrever `panel-planos`, `panel-novo-plano` (cria e edita) e `panel-pagamentos`; criar
  `panel-matricular`. Os arrays de exemplo e o `PLAN_DEFS` do protótipo saem.

## Firestore: regras e índice

`firestore.rules`, dentro de `match /coaches/{coachUid}`, três blocos no padrão de `squads`/`trainings`:

```
match /plans/{planId}       { allow read, write: if request.auth != null && request.auth.uid == coachUid; }
match /enrollments/{id}     { allow read, write: if request.auth != null && request.auth.uid == coachUid; }
match /charges/{chargeId}   { allow read, write: if request.auth != null && request.auth.uid == coachUid; }
```

`firestore.indexes.json`: um índice composto em `charges` (`status` ASC, `dueDate` ASC) para o listener de
atrasadas. O listener do mês e a consulta por `athleteUid` usam índices de campo único (automáticos).

**Ordem de publicação:** regras e índice **antes** do portal; o índice leva alguns minutos para ficar pronto.

## Entrega — 3 PRs

Todos partem da `main`; o Financeiro não depende de outras ramificações abertas (único ponto de contato:
`app.routes.ts`). Encadeados entre si, na ordem:

1. **Fundação + Planos:** modelo, regras puras, serviço, regras do Firestore, índice, testes de regras e as telas
   de Planos (listar, criar, editar, ativar/desativar). Útil sozinho.
2. **Matrícula:** tela de matricular e geração de parcelas, incluindo gerar próximos, trocar plano e encerrar.
3. **Pagamentos:** tela principal com mês, KPIs, abas, baixa, edição, cancelamento, desfazer e copiar cobrança.

## Testes

- **Specs das funções puras** (`finance-rules.spec.ts`): dia 31 ajustado ao fim do mês; ano bissexto (29/02);
  virada de ano; primeiro vencimento antes/depois do início; `periodKey` sem repetir; passos trimestral e anual;
  `chargeState` com data local (inclusive o limite "vence hoje" = pendente); totais do mês; receita mensal
  prevista; conversão de centavos sem erro de arredondamento (R$ 19,90, R$ 0,10 + R$ 0,20).
- **Regras do Firestore** (`npm run test:rules`, emulador): só o dono lê e escreve nas 3 coleções; outro usuário
  autenticado e anônimo são barrados em `plans`, `enrollments` e `charges`.
- `ng build coach` e `ng test coach` limpos.
- **QA visual** com rota temporária sem guard (removida antes do commit): estados vazios, formulários, seletor
  de mês e largura de 375px. Dados reais de cobrança só são vistos logado, no DEV.

## Riscos

- **Regra/índice não publicados:** o portal mostra erro de permissão/índice (sinal `error`), não lista vazia.
- **Fuso:** datas como texto `YYYY-MM-DD` e comparação no fuso local (já é o padrão de treinos).
- **Plano muda de valor:** parcelas geradas não mudam (intencional; a tela avisa).
- **Operações destrutivas** (encerrar matrícula, trocar plano) cancelam parcelas futuras pendentes: confirmação
  inline obrigatória; pagas e vencidas nunca são tocadas.
- **Duplo clique:** botões desabilitados enquanto grava; `generateMore` deduplica por `periodKey`.
- **Expectativa fiscal:** é livro-caixa, não emite nota nem processa pagamento; o aviso fica visível.

## Fora do escopo (fases seguintes)

Cobrança online Asaas (PIX/cartão, webhook, carteira, chave PIX de repasse, taxa da plataforma), lembrete
automático, aluno ver as próprias parcelas, cobrança avulsa (e o ciclo `avulso`), desconto familiar/irmãos, card de
inadimplência no Início, exportação, e controle de acesso por cargo (RBAC da comissão técnica).
