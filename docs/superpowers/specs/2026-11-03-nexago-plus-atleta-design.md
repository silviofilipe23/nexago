# nexaGO+ — plano pago do atleta (retenção)

**Data:** 03/11/2026 · **Status:** proposta · **Nome:** provisório

## Objetivo

Fazer o atleta que já joga **jogar mais pelo nexaGO** — concentrar inscrições e reservas aqui,
abrir o app toda semana e não ir embora na entressafra. A receita da assinatura é consequência;
o indicador que manda é a frequência do assinante.

O plano aprofunda a retenção de quem **já é ativo**. Não resgata o atleta casual: para esse, os
laços gratuitos (Liga com temporadas, Bora Jogar, push de "torneio do seu nível perto de você")
continuam sendo a alavanca.

## O que o plano nunca vende

- **Vantagem competitiva:** pontos, nível, Elo, sand rank, posição na chave, cabeça de chave,
  sorteio. Se dá pra comprar, o ranking deixa de valer para todo mundo.
- **O básico:** inscrever, reservar, ver chave, placar, Focus, perfil. O organizador depende de
  atleta; piorar o grátis encolhe a rede.

## Pacote (um plano só, para começar)

| Pilar | Benefício | Por que retém | Base que já existe |
|---|---|---|---|
| Economia | Isenção (ou 50%) da taxa de serviço do atleta em inscrições e reservas | Concentra o gasto no nexaGO ("já pago, vou usar") | Motor de perks do Squad (`squadPerkUses`, nexaGO banca, organizador recebe o mesmo líquido) |
| Economia | Cashback dobrado (2% → 4%), mesmo teto sobre a taxa | Saldo com validade de 6 meses puxa o atleta de volta | Cashback (`appConfig/cashback`, PR #550) |
| Evolução | "Seu mês no nexaGO": evolução do rating, aproveitamento por fase, com quem mais vence, metas | Valor sentido todo mês, mesmo jogando pouco | `ratingEvents`, partidas públicas, gráfico "Sua evolução" (#977) |
| Status | Selo/moldura de assinante, cards de compartilhar exclusivos | Identidade + divulgação orgânica | Moldura do sand rank, share cards |
| Prioridade | Inscrição antecipada (24h) **só se o organizador ligar**; +1 escudo de sequência/mês; prioridade na fila do clubinho | Medo de perder vaga sem tirar vaga de ninguém | Escudo do sand rank, clubinho |

**Contador de economia** na tela do plano e em push mensal ("você economizou R$ X este mês; o
plano custou R$ Y"). É o principal anti-cancelamento.

**Pausar em vez de cancelar** (lesão, entressafra): até 2 meses/ano, sem cobrança, sem benefício.

## Preço

Não fixado. Calibrar com dado real, porque a taxa de serviço é configurável por torneio
(`feeRule`, "quem paga"):

1. Distribuição da taxa de serviço paga por atleta ativo/mês (inscrição + reserva + clubinho).
2. Preço entre **40% e 60% da mediana** dos ativos. Quem joga muito ganha; a conta fecha pela
   frequência maior e por quem usa menos.
3. Anual com ~2 meses grátis (mesmo desenho do plano da arena).
4. A faixa de preço que a lista de espera responder (Fase 0) entra nessa conta.

**Margem do plano** = assinaturas − taxa renunciada − cashback extra − custo de cobrança.

## Regras de convivência

- **Squad:** embaixador já tem desconto/inscrição grátis por contrato. Vale o **maior** benefício
  por cobrança, nunca a soma.
- **Organizador:** recebe sempre o mesmo líquido (a nexaGO banca, como no Squad e no cashback).
  Inscrição antecipada é opção do torneio, desligada por padrão.
- **Ranking/nível/chave:** nenhuma regra olha para o plano.

## Riscos a resolver antes do MVP

- **Lojas (Apple/Google):** assinatura que libera recurso digital no app (relatório, selo) pode
  exigir a compra pela loja (15–30%). Benefício sobre serviço físico (quadra, torneio) costuma
  ficar fora. Validar a regra vigente no Brasil antes de fechar o pacote; alternativa é vender
  só pelo portal web e o app apenas reconhecer a assinatura.
- **Viés de medida:** quem assina já era engajado. Medir frequência **antes × depois** da
  assinatura do mesmo atleta, ou manter grupo de controle.
- **Canibalização da taxa:** coberta pela calibração de preço e pela margem acompanhada mês a mês.

## Fases

### Fase 0 — Lista de espera (este PR)

Porta falsa honesta: mede interesse antes de construir cobrança.

- Card na Início, abaixo de Novidades, só com `appConfig/athletePlus.waitlistEnabled == true`
  (doc ausente = some). Abre uma folha com os 4 pilares **sem números prometidos** e um aviso
  de que benefícios e preço estão em definição.
- Na folha, opcionais: "o que mais te interessa" (multi) e "quanto faz sentido pagar por mês"
  (faixas). Botão "Quero ser avisado". "Agora não" no card dispensa.
- Grava `athletePlusWaitlist/{uid}`:
  `{status: 'joined'|'dismissed', source, interests[], priceBand?, createdAt, updatedAt}`.
  Gravação única (só create; quem dispensou não vê mais o card). Rules: o atleta cria e lê só o
  próprio doc; ninguém lista; nada de update/delete pelo cliente.
- Analytics: `athlete_plus_card_shown` (1×/sessão), `athlete_plus_sheet_opened`,
  `athlete_plus_waitlist_joined` (`interests`, `price_band`), `athlete_plus_card_dismissed`.
- Relatório: `functions/scripts/athlete-plus-waitlist-report.js` (Admin SDK) conta inscritos,
  dispensas, interesses e faixas de preço. Flag por `set-athlete-plus-flag.js`.

**Critério para seguir para a Fase 1:** taxa de "Quero ser avisado" sobre cards exibidos e a faixa
de preço mediana compatível com a conta de margem. Sugestão de corte: ≥ 8% dos atletas que viram
o card entram na lista.

### Fase 1 — MVP pago

Assinatura recorrente no Asaas (mesma base dos planos de arena e de horário), isenção da taxa via
motor de perks, cashback 2×, selo, contador de economia, pausa. Quem está na lista recebe o convite
primeiro (push).

### Fase 2 — Evolução

Relatório "Seu mês no nexaGO" + push mensal; inscrição antecipada opcional por torneio.

### Fase 3 — Parceiros

Vouchers de marcas (`rankPartnerVouchers`), desconto na Loja.

## Métricas

- % dos atletas ativos (30d) que assinam.
- Frequência mensal (inscrições + reservas + clubinho) antes × depois da assinatura.
- Churn mensal (meta < 5%); pausas e retornos.
- Economia média percebida × preço.
- Margem do plano (fórmula acima).
