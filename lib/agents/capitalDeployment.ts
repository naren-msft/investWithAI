import type { AgentResult, Regime, Tranche } from "@/types";

export interface CapitalDeploymentOutput {
  currentTranche: Tranche;
  trancheBudget: number;     // dollars actually being deployed this phase
  deployableCash: number;    // cash − reserved buffer
}

// Sizes the next tranche from (cash − cashBuffer), scaled by the regime multiplier
// but capped at the configured tranche size and the deployable cash on hand.
export function capitalDeploymentAgent(
  tranches: Tranche[],
  cash: number,
  cashBuffer: number,
  regime: Regime
): AgentResult<CapitalDeploymentOutput> {
  const deployableCash = Math.max(0, cash - cashBuffer);
  const currentTranche = tranches.find((t) => t.status === "next") ?? tranches[0];
  const nominal = Math.round(currentTranche.size * regime.multiplier);
  const trancheBudget = Math.min(deployableCash, nominal, currentTranche.size * 1.5);

  const reasoning =
    `Phase ${currentTranche.phase}: nominal $${currentTranche.size.toLocaleString()} × regime ${regime.multiplier} = ` +
    `$${nominal.toLocaleString()}. Deployable cash $${deployableCash.toLocaleString()} ` +
    `(reserved buffer $${cashBuffer.toLocaleString()}). Tranche budget set to $${trancheBudget.toLocaleString()}. ` +
    `Gate: ${currentTranche.gate}`;

  return {
    agent: "CapitalDeploymentAgent",
    output: { currentTranche, trancheBudget, deployableCash },
    reasoning,
  };
}
