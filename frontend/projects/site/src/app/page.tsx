import { CinematicHero } from '@/components/ui/cinematic-hero';
import { Features } from '@/components/sections/Features';
import { ComoFunciona } from '@/components/sections/ComoFunciona';
import { Stats } from '@/components/sections/Stats';
import { TorneiosDestaque } from '@/components/sections/TorneiosDestaque';
import { ArenasCarousel } from '@/components/sections/ArenasCarousel';
import { Liga } from '@/components/sections/Liga';
import { ProvaSocial } from '@/components/sections/ProvaSocial';
import { FAQ } from '@/components/sections/FAQ';
import { Waitlist } from '@/components/sections/Waitlist';
import { Download } from '@/components/sections/Download';
import { getPublicTournaments } from '@/lib/firestore/tournaments';
import { getPublicArenas } from '@/lib/firestore/arenas';

export const revalidate = 300;

export default async function HomePage() {
  const [tournaments, arenas] = await Promise.all([
    getPublicTournaments(6),
    getPublicArenas(12),
  ]);

  return (
    <main className="overflow-x-hidden">
      <CinematicHero id="cinematic-hero" />
      <Features />
      <ComoFunciona />
      <Stats />
      <TorneiosDestaque tournaments={tournaments} />
      <ArenasCarousel
        arenas={arenas}
        eyebrow="Onde a areia acontece"
        title="Arenas pra jogar perto de você"
        description="Conheça as arenas que já fazem parte do nexaGO — encontre onde jogar, treinar e competir."
      />
      <Liga />
      {/* <ProvaSocial /> */}
      <FAQ />
      <Waitlist />
      <Download />
    </main>
  );
}
