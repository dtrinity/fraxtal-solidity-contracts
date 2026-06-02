import { getAddress } from "@ethersproject/address";

export interface GovernanceTargets {
  readonly deployer: string;
  readonly governance: string;
  readonly timelock?: string;
}

export function resolveGovernanceTargets(targets: GovernanceTargets): GovernanceTargets {
  return {
    deployer: getAddress(targets.deployer),
    governance: getAddress(targets.governance),
    timelock: targets.timelock ? getAddress(targets.timelock) : undefined,
  };
}

export function isGovernedHolder(holder: string, targets: GovernanceTargets): boolean {
  const lower = holder.toLowerCase();
  if (lower === targets.governance.toLowerCase()) {
    return true;
  }
  if (targets.timelock && lower === targets.timelock.toLowerCase()) {
    return true;
  }
  return false;
}

export function matchesGovernance(address: string, targets: GovernanceTargets): boolean {
  return address.toLowerCase() === targets.governance.toLowerCase();
}

export function matchesTimelock(address: string, targets: GovernanceTargets): boolean {
  return Boolean(targets.timelock && address.toLowerCase() === targets.timelock.toLowerCase());
}
