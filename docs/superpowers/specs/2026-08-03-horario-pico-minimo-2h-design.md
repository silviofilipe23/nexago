# Horário de pico: reserva mínima de 2h — Design

**Data:** 2026-08-03
**Contexto:** Arena parceira reporta demanda alta das 19h às 22h todos os dias, com pico às 20h. Para não deixar "hora morta" ao redor, hoje ela só aluga as 20h no balcão se o cliente levar mais uma hora (19h–21h ou 20h–22h). Precisamos suportar essa política no fluxo de reserva online do NexaGO.

## Decisões de produto (aprovadas pelo dono)

1. **Regra inteligente**: no horário de pico exige-se reserva mínima de 2h, **mas** a venda avulsa libera automaticamente quando não é possível montar o pacote (vizinhas vendidas/bloqueadas/fora do funcionamento) — nesse caso vender avulso não cria hora morta.
2. **Liberação por antecedência**: a arena configura `X` horas antes do horário; dentro dessa janela a exigência cai e o slot vira venda avulsa normal (melhor vender 1h do que quadra vazia).
3. **Gate por plano**: feature restrita a planos Pro+ via capability nova `horariosPico`, mesmo mecanismo de `promocoes`.
4. **Gestor e mensalistas isentos**: reservas criadas pela agenda do gestor e pelo materializer de recorrentes não passam pela regra (equivale ao balcão de hoje).

## 1. Modelo de dados

Nova subcoleção `arenas/{arenaId}/peakRules/{ruleId}`, espelhando o formato de `promotions`:

```
active: boolean
label: string                       // ex.: "Pico noturno"
courtIds: string[]                  // vazio = todas as quadras
weekdays: number[]                  // ISO 1..7, vazio = todos os dias
startTime: "HH:mm"                  // slot é "de pico" se o INÍCIO cai na faixa
endTime: "HH:mm"                    // fim exclusivo; faixa pode cruzar meia-noite
minDurationMinutes: number          // 120 (UI oferece 2h ou 3h)
releaseHoursBefore: number | null   // null = nunca libera por antecedência
createdAt, updatedAt: Timestamp
```

- Matcher de faixa idêntico ao `promoMatches` de `functions/src/arena-pricing.ts` (match pelo início do slot, `slotMin >= startMin && slotMin < endMin`, com suporte a faixa cruzando meia-noite).
- Caso concreto da arena: 1 regra ativa, todos os dias, todas as quadras, faixa `20:00–21:00`, mínimo `120`.
- Regras sobrepostas: quando mais de uma regra casa com o mesmo slot, vale o **maior** `minDurationMinutes`; para a janela de liberação vale o `releaseHoursBefore` da regra que impõe esse mínimo.

## 2. Predicado central (idêntico em servidor, web e Flutter)

Dada uma seleção de slots contíguos numa quadra/dia:

1. Nenhum slot da seleção casa com regra ativa de pico → **permitido**.
2. Duração total da seleção ≥ mínimo exigido → **permitido**.
3. Janela de liberação: se `agora ≥ início do slot de pico − releaseHoursBefore` → **permitido**. Comparação em `America/Sao_Paulo`, montando a data por componentes (`dateKey` + `startTime`) — nunca `Date.parse`/`toISOString` (lição do bug de deslocamento UTC em arenaSlots).
4. Caso contrário: **existe cadeia contígua disponível de duração ≥ mínimo contendo o slot de pico?**
   - Cadeia = slots consecutivos (`next.startTime === cursor.endTime`) com status disponível, na mesma quadra/dia, considerando slots virtuais + persistidos.
   - Se **não** existe → **permitido** (vizinhas ocupadas/bloqueadas/fechadas; avulso não cria hora morta).
   - Se existe → **bloqueado**: a reserva precisa cumprir o mínimo.

Os passos 3–4 são avaliados **por slot de pico** da seleção: a reserva é permitida quando o mínimo está atendido (passo 2) ou quando **todo** slot de pico selecionado está individualmente liberado (janela aberta ou sem cadeia possível); basta um slot de pico ainda restrito para bloquear.

A "regra inteligente" (item 1 das decisões) emerge do passo 4 — não há código de exceção separado.

## 3. Servidor (enforcement obrigatório)

- Novo módulo `functions/src/arena-peak-rules.ts`: parser do doc, matcher e o predicado acima recebendo os slots do dia.
- Chamado em **`quoteArenaBooking` e `createArenaBooking`** (`functions/src/arena-booking-create.ts`), após `loadPricingContext` e antes da transação. Cobre tanto o payload `selectedSlotStartTimes` quanto o fallback por intervalo (`startTime`/`endTime`).
- Violação → `HttpsError('failed-precondition', ...)` com mensagem em português informando o mínimo (ex.: "Este horário exige reserva mínima de 2h. Escolha 2 horas seguidas incluindo este horário.").
- Disponibilidade das vizinhas: `buildVirtualSlotsForDay` + slots persistidos do dia (mesma leitura já usada na cotação), avaliados fora da transação. Corrida residual é benigna: o double-booking continua protegido pelos `arenaSlotLocks`; no pior caso uma reserva avulsa passa/bloqueia com estado alguns segundos defasado.
- **Isenções**: nada muda em `arena-recurring-booking.ts`/`arena-recurring-materializer.ts` nem nos fluxos de criação pelo gestor — a regra só roda no caminho do atleta (`createArenaBooking`/`quoteArenaBooking`).
- O gate de plano é aplicado na **escrita** da configuração (painel + rules). O runtime respeita qualquer regra existente ativa, mesmo se a arena depois sair do Pro (comportamento igual ao de promoções).

## 4. UX do atleta

### Portal web (`frontend/projects/athlete`)

- `arena-booking.component.ts` passa a buscar as `peakRules` ativas junto com as promoções.
- Slot de pico **atualmente restrito** (predicado bloquearia o avulso) ganha badge no chip: "mín. 2h".
- Nas opções de duração (`durationOptions`), além do encadeamento atual (`chainForDuration`), opções abaixo do mínimo ficam desabilitadas com a dica: "Horário concorrido: reserva mínima de 2h".
- Quando a cadeia mínima não existe ou a janela de liberação abriu, o slot se comporta como slot normal (sem badge, 1h habilitada).
- Lógica compartilhada em `frontend/shared/arena-discovery/arena-peak-rule.ts` (parser + matcher + predicado), reusada pelo painel da arena.

### App Flutter (`nexago_app`)

- Predicado portado como lógica pura em `lib/features/arenas/domain/slots_page_logic.dart` (junto de `buildDurationOptions`/`selectRangeForDuration`).
- `slots_page.dart`: badge no chip do slot de pico restrito; opções de duração abaixo do mínimo desabilitadas com a mesma mensagem.
- Fluxo de criação inalterado — o servidor é a autoridade; a UI só evita frustração.

## 5. Painel da arena (`frontend/projects/arena`)

- Nova seção **"Horários de pico"** ao lado de Promoções: `src/app/painel/peak-rules/` com componente de lista, form e repository espelhando `painel/promotions/`.
- Form: label, quadras (multi, vazio = todas), dias da semana, faixa horária, mínimo (select 2h/3h), liberação por antecedência (opcional, em horas).
- Gate: capability nova `horariosPico` no empacotamento de planos (Pro+), mesmo mecanismo de `hasCapability('promocoes')`.
- Status "ativa/inativa" derivado no cliente, como em promoções.

## 6. Firestore rules

```
match /arenas/{arenaId}/peakRules/{ruleId} {
  allow read: if true;                       // grade do atleta renderiza a restrição
  allow create, update, delete:
    if isSuperAdmin() || arenaCanWrite(arenaId, 'promocoes');
}
```

Mesma área RBAC de promoções — é regra comercial, quem gere promoções gere pico.

## 7. Tratamento de erros

- Servidor: `failed-precondition` com mensagem em português (exibida pelos toasts de erro de callable já existentes nos clientes).
- UI: estados desabilitados com explicação; nunca deixar o atleta chegar ao pagamento com seleção inválida (o quote também valida, então uma seleção forçada falha cedo).

## 8. Testes

- **Functions (unit)**: predicado — vizinhas livres/ocupadas/bloqueadas/fechadas; janela de liberação (limites e timezone); quadra com `slotDurationMinutes: 30` (mínimo 120 = 4 slots); faixa cruzando meia-noite; duas regras sobrepostas (vale o maior mínimo); fallback por intervalo sem `selectedSlotStartTimes`.
- **Shared lib (unit)**: mesmos casos no predicado TS compartilhado.
- **Flutter**: testes Dart para a lógica em `slots_page_logic.dart` (via agente flutter-test-engineer na implementação).

## Fora do escopo (v1)

- Sobretaxa de preço no avulso de pico.
- Clubinho (jogo aberto), convites de reserva e waitlist.
- Configuração pelo app Flutter (config só no painel web da arena).
- UI de simulação/prévia da regra na agenda do gestor.

## Rollout

Ordem: rules → functions (deploy) → painel arena (CRUD) → portais/app do atleta. Sem regra cadastrada, comportamento atual permanece idêntico (retrocompatível por construção).
