import { CinematicHero } from '@/components/ui/cinematic-hero';
import { Features } from '@/components/sections/Features';
import { ComoFunciona } from '@/components/sections/ComoFunciona';
import { TorneiosDestaque } from '@/components/sections/TorneiosDestaque';
import { Liga } from '@/components/sections/Liga';
import { ProvaSocial } from '@/components/sections/ProvaSocial';
import { FAQ } from '@/components/sections/FAQ';
import { Waitlist } from '@/components/sections/Waitlist';
import { Download } from '@/components/sections/Download';
import { getPublicTournaments } from '@/lib/firestore/tournaments';

export const revalidate = 300;

export default async function HomePage() {
  const tournaments = await getPublicTournaments(6);

  return (
    <main className="overflow-x-hidden">
      <CinematicHero id="cinematic-hero" />
      <Features />
      <ComoFunciona />
      <TorneiosDestaque tournaments={tournaments} />
      {/* <Liga /> */}
      <ProvaSocial />
      <FAQ />
      <Waitlist />
      <Download />
    </main>
  );
}
