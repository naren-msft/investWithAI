// Lightweight keyword-based sentiment scorer for stock headlines.
//
// Ross Cameron's play is momentum on a *positive* catalyst — the trader is
// buying strength, so the screener should surface bullish, up-move news and
// suppress negative/bearish or clearly-neutral headlines. This is a heuristic
// (no ML / no API key): each headline is scored by summing positive keyword
// weights and subtracting negative ones. It is intentionally conservative —
// when in doubt a headline scores 0 (neutral) and, in positive-only mode, is
// dropped.

const POSITIVE: Array<[RegExp, number]> = [
  [/\bsoars?\b|\bsoaring\b/i, 3],
  [/\bsurges?\b|\bsurging\b/i, 3],
  [/\bskyrockets?\b|\brockets?\b/i, 3],
  [/\bjumps?\b|\bjumping\b/i, 2],
  [/\bspikes?\b|\bspiking\b/i, 2],
  [/\brally(?:s|ing)?\b|\brallies\b/i, 2],
  [/\bsurpass(?:es|ed)?\b/i, 2],
  [/\bbeats?\b|\bbeat\s+estimates?\b/i, 3],
  [/\btops?\s+estimates?\b/i, 3],
  [/\brecord\s+(?:high|revenue|sales|quarter|results)\b/i, 3],
  [/\ball[-\s]?time\s+high\b/i, 3],
  [/\bupgrade[ds]?\b/i, 3],
  [/\braises?\s+(?:guidance|outlook|price\s+target|forecast)\b/i, 3],
  [/\bboosts?\s+(?:guidance|outlook|forecast)\b/i, 3],
  [/\bhikes?\s+(?:guidance|target)\b/i, 2],
  [/\bfda\s+approv/i, 4],
  [/\bapprov(?:al|es|ed)\b/i, 2],
  [/\bclearance\b|\bcleared\b/i, 2],
  [/\bgrant(?:ed|s)?\b/i, 1],
  [/\bwins?\b|\bwinning\b|\bawarded?\b/i, 2],
  [/\bsecures?\b|\bsecured\b/i, 2],
  [/\b(?:new|major|multi[-\s]?year)\s+contract\b/i, 3],
  [/\bpartnership\b|\bpartners?\s+with\b/i, 2],
  [/\bcollaborat/i, 1],
  [/\bacqui(?:res|red|sition)\b/i, 2],
  [/\bmerger\b|\bto\s+be\s+acquired\b|\bbuyout\b/i, 3],
  [/\bpositive\s+(?:data|results|trial)\b/i, 3],
  [/\bbreakthrough\b/i, 3],
  [/\bmilestone\b/i, 1],
  [/\bexpands?\b|\bexpansion\b/i, 1],
  [/\blaunch(?:es|ed)?\b/i, 1],
  [/\bstrong\s+(?:demand|growth|results|quarter|guidance)\b/i, 2],
  [/\bprofit(?:able|s)?\b/i, 1],
  [/\bbullish\b/i, 2],
  [/\bbuy\s+rating\b|\boutperform\b|\boverweight\b/i, 2],
  [/\bgains?\b|\bclimbs?\b|\brises?\b|\bhigher\b/i, 1],
  [/\bpops?\b|\bpopping\b/i, 2],
];

const NEGATIVE: Array<[RegExp, number]> = [
  [/\bplunges?\b|\bplummets?\b|\bcrashes?\b|\btanks?\b/i, 4],
  [/\bslumps?\b|\bsinks?\b|\btumbles?\b|\bslides?\b/i, 3],
  [/\bdrops?\b|\bfalls?\b|\bdeclines?\b|\blower\b/i, 2],
  [/\bmiss(?:es|ed)?\s+(?:estimates?|expectations?)\b/i, 4],
  [/\bcuts?\s+(?:guidance|outlook|forecast|price\s+target)\b/i, 4],
  [/\bslash(?:es|ed)?\b|\blowers?\s+(?:guidance|outlook)\b/i, 3],
  [/\bdowngrade[ds]?\b/i, 4],
  [/\bsell\s+rating\b|\bunderperform\b|\bunderweight\b/i, 3],
  [/\blawsuit\b|\bsued?\b|\blitigation\b/i, 3],
  [/\binvestigation\b|\bprobe\b|\bsubpoena\b/i, 3],
  [/\bsec\s+(?:charges?|probe|investigation)\b/i, 4],
  [/\bfraud\b|\bmisconduct\b/i, 4],
  [/\bbankrupt(?:cy)?\b|\bchapter\s*11\b|\bdefault\b/i, 5],
  [/\bdelist(?:ed|ing)?\b/i, 4],
  [/\brecall\b/i, 3],
  [/\bwarn(?:s|ing|ed)?\b/i, 2],
  [/\bhalt(?:ed|s)?\b/i, 1],
  [/\bfails?\b|\bfailed\b|\bfailure\b/i, 3],
  [/\brejects?\b|\brejected\b|\bdenied\b/i, 3],
  [/\blayoffs?\b|\bcuts?\s+jobs\b|\brestructur/i, 2],
  [/\bbearish\b/i, 2],
  [/\bshort\s+seller\b|\bshort\s+report\b/i, 3],
  [/\bdilut(?:ion|ive|es)\b|\bstock\s+offering\b|\bpriced\s+offering\b/i, 3],
  [/\bloss(?:es)?\b|\bwiden(?:s|ing)?\s+loss\b/i, 2],
  [/\bnon[-\s]?compliance\b|\bnoncompliance\b|\bdeficiency\b/i, 3],
  [/\bgoing\s+concern\b/i, 4],
  [/\breverse\s+split\b/i, 2],
  [/\bhalt(?:ed|s)?\s+trading\b|\btrading\s+halt\b/i, 2],
];

export interface SentimentResult {
  score: number; // >0 positive, <0 negative, 0 neutral
  positive: boolean;
  negative: boolean;
}

// Generic market-roundup / list headlines that are not a stock-specific
// catalyst (they incidentally mention the ticker). These are dropped even when
// the keyword scorer assigns an incidental positive point.
const GENERIC = [
  /\bmost\s+active\b/i,
  /\btop\s+(?:pre[-\s]?market\s+)?(?:gainers|losers|movers)\b/i,
  /\bpre[-\s]?market\s+(?:gainers|losers|movers|winners)\b/i,
  /\bstocks?\s+to\s+watch\b/i,
  /\bthings?\s+to\s+know\b/i,
  /\bmarket\s+(?:wrap|update|recap|open|close)\b/i,
  /\bequity\s+futures\b/i,
  /\bexchange[-\s]?traded\s+funds\b/i,
  /\bwhat\s+to\s+watch\b/i,
  /\bbiggest\s+movers\b/i,
  /^BC-/i,
];

/** True when a headline is a generic market roundup rather than a real catalyst. */
export function isGenericHeadline(title: string): boolean {
  return GENERIC.some((re) => re.test(title));
}

/** Score a headline (optionally with a summary) for bullish/bearish tone. */
export function scoreSentiment(title: string, summary?: string): SentimentResult {
  const text = `${title} ${summary ?? ""}`;
  let score = 0;
  for (const [re, w] of POSITIVE) if (re.test(text)) score += w;
  for (const [re, w] of NEGATIVE) if (re.test(text)) score -= w;
  return { score, positive: score > 0, negative: score < 0 };
}
