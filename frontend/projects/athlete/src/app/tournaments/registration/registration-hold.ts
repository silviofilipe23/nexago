/** Aviso do prazo de garantia da vaga na tela de inscrição.
 *
 *  Módulo puro (padrão de `painel/registration-progress.ts`): a regra mora aqui e é o que os
 *  testes exercitam. Espelha `registrationHoldNotice` do app Flutter — mesmas frases nas duas
 *  superfícies, senão o atleta lê um prazo no celular e outro no navegador. */

/** Frase do prazo, ou `null` quando não há relógio real para mostrar.
 *
 *  Com convite pendente vivo a vaga acompanha o convite (48h) e a contagem some: mostrá-la ali
 *  mentiria sobre quanto tempo o atleta tem. Inscrição sem `holdExpiresAt` — anterior à regra,
 *  criada pelo organizador, em fila ou de torneio com o prazo desligado — também não mostra nada. */
export function registrationHoldNotice(params: {
  holdExpiresAt: Date | null;
  isPaid: boolean;
  hasLivePartnerInvite: boolean;
  now?: Date;
}): string | null {
  const { holdExpiresAt, isPaid, hasLivePartnerInvite } = params;
  if (!holdExpiresAt || isPaid || hasLivePartnerInvite) return null;
  const now = params.now ?? new Date();
  const remainingMs = holdExpiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'Prazo encerrado — sua vaga será liberada.';
  return `Vaga garantida até ${clockLabel(holdExpiresAt, now)} · ${remainingLabel(remainingMs)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Hora de parede local; ganha a data quando o vencimento não é hoje. */
function clockLabel(expiresAt: Date, now: Date): string {
  const time = `${pad(expiresAt.getHours())}:${pad(expiresAt.getMinutes())}`;
  const sameDay =
    expiresAt.getFullYear() === now.getFullYear() &&
    expiresAt.getMonth() === now.getMonth() &&
    expiresAt.getDate() === now.getDate();
  if (sameDay) return time;
  return `${pad(expiresAt.getDate())}/${pad(expiresAt.getMonth() + 1)} ${time}`;
}

function remainingLabel(remainingMs: number): string {
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return 'falta menos de 1 min';
  if (minutes < 60) return `faltam ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'falta 1 hora' : `faltam ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'falta 1 dia' : `faltam ${days} dias`;
}
