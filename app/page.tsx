import { DalaNav } from "@/components/dala/DalaNav";
import { DalaHero } from "@/components/dala/DalaHero";
import { DalaIntro } from "@/components/dala/DalaIntro";
import { DalaManifesto } from "@/components/dala/DalaManifesto";
import { DalaPillars } from "@/components/dala/DalaPillars";
import { DalaAnchor } from "@/components/dala/DalaAnchor";
import { DalaFooter } from "@/components/dala/DalaFooter";
import { DalaLoader } from "@/components/dala/DalaLoader";

export const dynamic = "force-static";

export default function Home() {
  return (
    <div className="dala" style={{ minHeight: "100vh", background: "#000" }}>
      <DalaLoader />
      <DalaNav />
      <main>
        <DalaHero />
        <DalaIntro />
        <DalaManifesto />
        <DalaPillars />
        <DalaAnchor />
      </main>
      <DalaFooter />
    </div>
  );
}
