import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import ScatterForm from "@/components/scatter/ScatterForm";
import { NAV } from "@/lib/nav";

export default function Home() {
  return (
    <PageShell
      nav={NAV}
      title="Pay many at once"
      description="Paste a list of addresses and amounts. One transaction pays all of them."
    >
      <BotChainGate>
        <ScatterForm />
      </BotChainGate>
    </PageShell>
  );
}
