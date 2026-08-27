import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Excluir Conta',
  description:
    'Como solicitar a exclusão da sua conta e dos seus dados pessoais no aplicativo nexaGO.',
  alternates: { canonical: '/excluir-conta' },
  openGraph: {
    title: 'Excluir Conta · nexaGO',
    description: 'Como excluir sua conta e seus dados pessoais no aplicativo nexaGO.',
    url: '/excluir-conta',
  },
};

const LAST_UPDATE = '26 de agosto de 2026';
const CONTACT_EMAIL = 'contato@nexago.com.br';
const COMPANY = 'Nrs Desenvolvimento De Programas De Computador Sob Encomenda Ltda';
const CNPJ = '66.753.240/0001-75';
const ADDRESS = 'Rua Pais Leme, 215, Conj 1713, Pinheiros, São Paulo, SP, 05424-150';

const SECTIONS = [
  { id: 'sobre', title: '1. Sobre o aplicativo' },
  { id: 'app', title: '2. Excluir pelo aplicativo' },
  { id: 'email', title: '3. Sem acesso ao aplicativo' },
  { id: 'excluidos', title: '4. Dados excluídos' },
  { id: 'retidos', title: '5. Dados mantidos e por quê' },
  { id: 'contato', title: '6. Contato' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-xl font-700 tracking-tight text-fg sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-text-mute sm:text-base">{children}</div>
    </section>
  );
}

export default function ExcluirContaPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal>
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Legal</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          Excluir Conta
        </h1>
        <p className="mt-4 text-sm text-text-dim">Última atualização: {LAST_UPDATE}</p>
        <p className="mt-6 text-balance text-base leading-relaxed text-text-mute">
          Esta página explica como solicitar a exclusão da sua conta e dos seus dados pessoais no
          aplicativo nexaGO, em conformidade com as políticas de exclusão de conta da Google Play e
          da App Store e com a Lei Geral de Proteção de Dados (LGPD). Veja também a nossa{' '}
          <Link href="/privacidade" className="text-brand underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </Reveal>

      {/* Índice */}
      <nav aria-label="Índice" className="mt-10 rounded-4 border border-line bg-surface-1 p-5">
        <h2 className="mb-3 font-mono text-xs font-600 uppercase tracking-[0.2em] text-text-dim">Nesta página</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-text-mute transition-colors hover:text-brand focus-visible:text-brand focus-visible:outline-none"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        <Section id="sobre" title="1. Sobre o aplicativo">
          <p>
            O aplicativo <strong className="font-600 text-fg">nexaGO</strong>, disponível para
            Android e iOS, é operado por <strong className="font-600 text-fg">{COMPANY}</strong>,
            inscrita no CNPJ sob nº <strong className="font-600 text-fg">{CNPJ}</strong>, com sede
            em <strong className="font-600 text-fg">{ADDRESS}</strong>.
          </p>
          <p>
            Esta página descreve como excluir a conta de atleta criada no aplicativo — a mesma conta
            usada para se inscrever em torneios, acompanhar rankings e participar da Liga nexaGO.
          </p>
        </Section>

        <Section id="app" title="2. Excluir pelo aplicativo">
          <p>
            A forma mais rápida é excluir a conta diretamente no aplicativo, com efeito imediato:
          </p>
          <ol className="ml-5 list-decimal space-y-2 marker:text-brand">
            <li>Abra o aplicativo nexaGO e entre na sua conta.</li>
            <li>Toque no seu perfil e depois no ícone de Configurações.</li>
            <li>Role até o final da tela e toque em “Excluir conta”.</li>
            <li>Confirme a ação na caixa de diálogo, tocando em “Excluir minha conta”.</li>
          </ol>
          <p>
            Sua conta e seus dados pessoais são apagados imediatamente e a sessão é encerrada em
            todos os dispositivos. Esta ação é permanente e não pode ser desfeita.
          </p>
        </Section>

        <Section id="email" title="3. Sem acesso ao aplicativo">
          <p>
            Se você não tem mais acesso ao aplicativo ou não consegue entrar na sua conta, pode
            solicitar a exclusão por e-mail, enviando uma mensagem para{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>{' '}
            com o assunto “Exclusão de conta” e informando o e-mail ou telefone usado no cadastro.
          </p>
          <p>
            Nossa equipe confirma o recebimento e processa a exclusão manualmente, aplicando os
            mesmos critérios do processo automático descrito acima.
          </p>
        </Section>

        <Section id="excluidos" title="4. Dados excluídos">
          <p>Ao excluir sua conta, apagamos permanentemente:</p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>
              <strong className="font-600 text-fg">Dados de perfil:</strong> nome, foto,
              categoria/nível esportivo, gênero e demais informações de cadastro.
            </li>
            <li>
              <strong className="font-600 text-fg">Preferências:</strong> tema, notificações e
              favoritos.
            </li>
            <li>
              <strong className="font-600 text-fg">Notificações e dispositivos:</strong> histórico
              de notificações e tokens de dispositivos vinculados à conta.
            </li>
            <li>
              <strong className="font-600 text-fg">Credenciais de acesso:</strong> sua conta é
              removida do nosso provedor de autenticação — não é mais possível entrar com ela.
            </li>
          </ul>
        </Section>

        <Section id="retidos" title="5. Dados mantidos e por quê">
          <p>
            Alguns registros não fazem parte do seu perfil pessoal e continuam existindo por
            exigência legal ou para preservar a integridade de torneios já disputados:
          </p>
          <ul className="ml-5 list-disc space-y-2 marker:text-brand">
            <li>
              <strong className="font-600 text-fg">Inscrições e pagamentos</strong> em torneios,
              mantidos pelo prazo exigido pela legislação fiscal e civil aplicável.
            </li>
            <li>
              <strong className="font-600 text-fg">Resultados, chaves e rankings</strong>,
              preservados para não corromper competições em andamento ou já encerradas.
            </li>
          </ul>
          <p>
            Esses registros deixam de estar associados ao seu perfil pessoal após a exclusão. Para
            mais detalhes sobre retenção e seus direitos, veja a nossa{' '}
            <Link href="/privacidade" className="text-brand underline-offset-2 hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </Section>

        <Section id="contato" title="6. Contato">
          <p>
            Dúvidas sobre a exclusão da sua conta podem ser enviadas para{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
