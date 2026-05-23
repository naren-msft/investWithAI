// Theme taxonomy for the Stock Screener page.
//
// Each ThemeTicker carries:
//   - tag: "core" | "emerging" | "venture" — used for tier-aware thresholds
//   - chokepoint: 1-line moat statement rendered in the GateBreakdown tooltip
//   - moatType: which Dorsey moat source applies (drives Gate 2 narrative)
//   - secondaryThemes: cross-references (e.g. AVGO is primary in AI Compute,
//     secondary in Datacenter Networking) — counted only once in caps.

export type ThemeTag = "core" | "emerging" | "venture";

export type MoatType =
  | "network"      // Network effects (data, ecosystem)
  | "switching"    // Switching costs (ecosystem lock-in, integration)
  | "intangible"   // Patents, regulatory licenses, brand
  | "cost"         // Cost advantage (scale, process IP)
  | "scale"        // Efficient scale (natural oligopoly)
  | "regulatory";  // Regulatory moat (FDA, FCC, gov't license)

export type ThemeKey =
  | "ai-compute"
  | "chip-equipment"
  | "memory-hbm"
  | "datacenter-networking"
  | "datacenter-power"
  | "cybersecurity"
  | "healthcare-ai"
  | "quantum-compute"
  | "quantum-safe";

export interface ThemeTicker {
  ticker: string;
  name: string;
  tag: ThemeTag;
  chokepoint: string;
  moatType: MoatType;
  secondaryThemes?: ThemeKey[];
}

export interface Theme {
  key: ThemeKey;
  label: string;
  rationale: string;
  sleeveCapPct: number;     // max % of screener capital per theme (advisory)
  tickers: ThemeTicker[];
}

export const THEMES: Theme[] = [
  {
    key: "ai-compute",
    label: "AI Compute",
    rationale: "GPUs and accelerators are the petaflop bottleneck for frontier AI training & inference. Vendors with software lock-in keep pricing power.",
    sleeveCapPct: 0.25,
    tickers: [
      { ticker: "NVDA", name: "NVIDIA",                tag: "core",     chokepoint: "CUDA software moat; H100/H200/Blackwell de facto standard for frontier model training",                                moatType: "switching" },
      { ticker: "AMD",  name: "Advanced Micro Devices", tag: "core",     chokepoint: "Only credible #2 AI GPU (MI300X/MI350X); EPYC datacenter CPU leadership",                                              moatType: "intangible" },
      { ticker: "AVGO", name: "Broadcom",               tag: "core",     chokepoint: "Custom AI ASICs for hyperscalers (Google TPU, Meta); Ethernet switching ASIC monopoly",                              moatType: "scale", secondaryThemes: ["datacenter-networking"] },
      { ticker: "MRVL", name: "Marvell Technology",     tag: "emerging", chokepoint: "Custom ASIC design + coherent optical interconnects (Inphi); DPU silicon",                                            moatType: "intangible", secondaryThemes: ["datacenter-networking"] },
    ],
  },
  {
    key: "chip-equipment",
    label: "Chipmaking Equipment",
    rationale: "Every advanced chip passes through equipment from ≤5 companies. Capex cycle beneficiaries regardless of which chip vendor wins.",
    sleeveCapPct: 0.20,
    tickers: [
      { ticker: "ASML", name: "ASML Holding",       tag: "core",     chokepoint: "Sole manufacturer of EUV lithography machines — 100% share, no credible competitor within 5+ years", moatType: "intangible" },
      { ticker: "AMAT", name: "Applied Materials",  tag: "core",     chokepoint: "Broadest equipment portfolio (CVD, PVD, CMP, etch, ion implant); #2 by revenue globally",            moatType: "scale" },
      { ticker: "LRCX", name: "Lam Research",       tag: "core",     chokepoint: "#1 in etch + thin-film deposition; critical for 3D NAND and advanced logic",                        moatType: "intangible" },
      { ticker: "KLAC", name: "KLA Corporation",    tag: "core",     chokepoint: "~50% share of wafer inspection/metrology — every fab needs KLA tools to run blind-free",            moatType: "intangible" },
      { ticker: "ONTO", name: "Onto Innovation",    tag: "emerging", chokepoint: "Advanced-packaging metrology; critical for HBM stacking yield",                                     moatType: "intangible" },
      { ticker: "ENTG", name: "Entegris",           tag: "emerging", chokepoint: "Consumables moat (specialty gases, filters, CMP pads); every wafer needs Entegris materials",       moatType: "switching" },
    ],
  },
  {
    key: "memory-hbm",
    label: "Memory / HBM",
    rationale: "AI demands bandwidth not just compute. HBM is co-packaged with GPUs and only 3 producers globally; MU is the lone US-listed pure-play.",
    sleeveCapPct: 0.12,
    tickers: [
      { ticker: "MU",   name: "Micron Technology", tag: "core",     chokepoint: "Only US-listed pure HBM3E producer; FY25 rev $37.4B (+61% YoY); CHIPS Act beneficiary", moatType: "scale" },
      { ticker: "WOLF", name: "Wolfspeed",         tag: "emerging", chokepoint: "SiC wide-bandgap power semis — adjacent infrastructure for datacenter power efficiency", moatType: "intangible" },
    ],
  },
  {
    key: "datacenter-networking",
    label: "Datacenter Networking",
    rationale: "AI clusters demand 400G/800G/1.6T fabrics. Bandwidth bottlenecks at the network are the new performance ceiling.",
    sleeveCapPct: 0.12,
    tickers: [
      { ticker: "ANET", name: "Arista Networks",    tag: "core",     chokepoint: "#1 datacenter switch vendor; EOS software runs as single image across all devices — high switching cost", moatType: "switching" },
      { ticker: "CIEN", name: "Ciena",              tag: "emerging", chokepoint: "WaveLogic coherent optics; carriers upgrading backbone capacity for AI traffic surge",                   moatType: "intangible" },
    ],
  },
  {
    key: "datacenter-power",
    label: "Datacenter Power & Cooling",
    rationale: "AI GPUs consume 700-1000W each; a rack of H100s needs 40-80kW. Power delivery and thermal management are the physical constraint.",
    sleeveCapPct: 0.12,
    tickers: [
      { ticker: "VRT",   name: "Vertiv Holdings",   tag: "core",     chokepoint: "Critical power (UPS, PDU) and thermal management; every GPU rack passes through Vertiv's power systems", moatType: "scale" },
      { ticker: "ETN",   name: "Eaton",             tag: "core",     chokepoint: "Electrical switchgear, UPS, busbar systems for hyperscale datacenters",                                  moatType: "scale" },
      { ticker: "GEV",   name: "GE Vernova",        tag: "core",     chokepoint: "Gas turbines + grid equipment; baseload power for AI campuses",                                          moatType: "scale" },
      { ticker: "GNRC",  name: "Generac",           tag: "emerging", chokepoint: "Standby/backup power for N+1/N+2 datacenter redundancy",                                                 moatType: "scale" },
      { ticker: "NVT",   name: "nVent Electric",    tag: "emerging", chokepoint: "Thermal management enclosures and rack cooling — beneficiary of liquid-cooling conversion",              moatType: "intangible" },
      { ticker: "BE",    name: "Bloom Energy",      tag: "emerging", chokepoint: "Solid-oxide fuel cells for behind-the-meter datacenter power",                                            moatType: "intangible" },
    ],
  },
  {
    key: "cybersecurity",
    label: "Cybersecurity",
    rationale: "AI expands the attack surface (AI phishing, deepfakes, autonomous malware). Spend on security is non-discretionary as AI adoption accelerates.",
    sleeveCapPct: 0.15,
    tickers: [
      { ticker: "CRWD", name: "CrowdStrike",         tag: "core",     chokepoint: "Falcon platform unifies endpoint + identity + cloud; Charlotte AI generative SOC; NRR historically >120%", moatType: "switching" },
      { ticker: "PANW", name: "Palo Alto Networks",  tag: "core",     chokepoint: "Platformization — replacing 3-5 best-of-breed tools; CyberArk acquisition ($25B, Feb 2026)",            moatType: "switching", secondaryThemes: ["quantum-safe"] },
      { ticker: "ZS",   name: "Zscaler",             tag: "core",     chokepoint: "Largest inline security cloud; 150+ datacenters in 185+ countries — efficient-scale moat",              moatType: "scale" },
      { ticker: "FTNT", name: "Fortinet",            tag: "core",     chokepoint: "Custom ASIC-based security appliances (proprietary hardware moat); SMB/MidMarket reach",                moatType: "intangible" },
      { ticker: "S",    name: "SentinelOne",         tag: "emerging", chokepoint: "AI-native autonomous endpoint + Purple AI copilot; competitive challenger to CRWD",                     moatType: "intangible" },
    ],
  },
  {
    key: "healthcare-ai",
    label: "Healthcare AI",
    rationale: "FDA approving AI-enabled medical devices at accelerating rates; genomic data networks have data-moat characteristics; robotic surgery installed-base lock-in.",
    sleeveCapPct: 0.10,
    tickers: [
      { ticker: "ISRG", name: "Intuitive Surgical",   tag: "core",     chokepoint: "da Vinci robotic surgery installed base (9000+ systems); 25+ years of FDA outcome data — regulatory moat", moatType: "regulatory" },
      { ticker: "GEHC", name: "GE HealthCare",        tag: "core",     chokepoint: "Edison AI platform on 4M+ deployed imaging devices (CT, MRI, ultrasound)",                                 moatType: "scale" },
      { ticker: "VEEV", name: "Veeva Systems",        tag: "core",     chokepoint: "Life-sciences cloud (Veeva Vault) — extreme switching costs once full pipeline is managed there",         moatType: "switching" },
      { ticker: "TMO",  name: "Thermo Fisher",        tag: "core",     chokepoint: "Picks-and-shovels for all AI drug discovery — every AI biotech needs TMO instruments",                    moatType: "scale" },
      { ticker: "TEM",  name: "Tempus AI",            tag: "emerging", chokepoint: "Largest proprietary oncology genomic/clinical dataset; data-network-effect moat (more sequencing → better models)", moatType: "network" },
      { ticker: "RXRX", name: "Recursion Pharmaceuticals", tag: "emerging", chokepoint: "50+ PB phenomics dataset; partnerships with NVIDIA, Bayer, Roche",                                    moatType: "network" },
    ],
  },
  {
    key: "quantum-compute",
    label: "Quantum Computing",
    rationale: "Quantum hardware is pre-commercial but early adopters in defense, pharma, finance are signing cloud-access agreements. Staged venture bet on hardware milestones.",
    sleeveCapPct: 0.06,
    tickers: [
      { ticker: "IBM",   name: "IBM",                  tag: "emerging", chokepoint: "Largest installed quantum base (1000+ qubits); Heron processor; quantum-as-a-service via IBM Cloud",   moatType: "intangible", secondaryThemes: ["quantum-safe"] },
      { ticker: "IONQ",  name: "IonQ",                 tag: "venture",  chokepoint: "Trapped-ion quantum on AWS/Azure/GCP; $130M revenue (2025); acquired Oxford Ionics, SkyWater, ID Quantique", moatType: "intangible", secondaryThemes: ["quantum-safe"] },
      { ticker: "QBTS",  name: "D-Wave Quantum",       tag: "venture",  chokepoint: "Quantum annealing (optimization-only); first commercially available quantum computer; Advantage2 system", moatType: "intangible" },
      { ticker: "RGTI",  name: "Rigetti Computing",    tag: "venture",  chokepoint: "Superconducting gate-model quantum; 84-qubit processor; full-stack (fab + software)",                  moatType: "intangible" },
      { ticker: "GOOGL", name: "Alphabet",             tag: "emerging", chokepoint: "Willow chip — below-threshold error correction milestone (Dec 2024); largest quantum R&D budget",       moatType: "intangible" },
    ],
  },
  {
    key: "quantum-safe",
    label: "Quantum-Safe / PQC",
    rationale: "NIST finalized ML-KEM and ML-DSA standards in Aug 2024. Every TLS handshake and PKI cert faces migration. 'Harvest now, decrypt later' creates urgency.",
    sleeveCapPct: 0.04,
    tickers: [
      { ticker: "PANW", name: "Palo Alto Networks", tag: "core",     chokepoint: "Prisma SASE/Strata integrating PQC-ready TLS; platformization means PQC is a product update, not a rebuild", moatType: "switching" },
      { ticker: "IONQ", name: "IonQ",               tag: "venture",  chokepoint: "Acquired ID Quantique (May 2025) — leading QKD hardware vendor with 100+ patents",                          moatType: "intangible" },
      { ticker: "IBM",  name: "IBM",                tag: "emerging", chokepoint: "IBM Quantum Safe offering; contributed to NIST PQC standards process; OpenQuantumSafe integration",       moatType: "intangible" },
    ],
  },
];

/** Get the full deduplicated ticker universe across all themes (primary listing only). */
export function allScreenerTickers(): string[] {
  const seen = new Set<string>();
  for (const t of THEMES) {
    for (const x of t.tickers) {
      if (!seen.has(x.ticker)) seen.add(x.ticker);
    }
  }
  return Array.from(seen);
}

/** Find a ticker's primary theme entry — the first theme that lists it. */
export function findPrimaryTheme(ticker: string): { theme: Theme; entry: ThemeTicker } | null {
  for (const t of THEMES) {
    const entry = t.tickers.find((x) => x.ticker === ticker);
    if (entry) return { theme: t, entry };
  }
  return null;
}
