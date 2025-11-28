import hre from "hardhat";

type VerifyOptions = {
  match?: RegExp;
  only?: Set<string>;
  force?: boolean;
};

type DeploymentRecord = {
  address: string;
  args?: unknown[];
  metadata?: string;
};

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const network = hre.network.name;
  // Get all known deployments for the current network
  const deployments = (await hre.deployments.all()) as Record<string, DeploymentRecord>;

  const entries = Object.entries(deployments).filter(([name]) => {
    if (opts.only && !opts.only.has(name)) return false;
    if (opts.match && !opts.match.test(name)) return false;
    return true;
  });

  for (const [deploymentName, deployment] of entries) {
    if (!opts.force && (await isAlreadyVerified(deployment.address))) {
      console.log(`✅ skipping ${deploymentName}: already verified`);
      continue;
    }

    const constructorArguments = deployment.args ?? [];

    let fullyQualifiedName: string | undefined;
    if (deployment.metadata) {
      try {
        const metadata = JSON.parse(deployment.metadata) as { settings?: { compilationTarget?: Record<string, string> } };
        const target = metadata.settings?.compilationTarget;
        if (target) {
          const [[contractPath, contractName]] = Object.entries(target);
          fullyQualifiedName = `${contractPath}:${contractName}`;
        }
      } catch (error) {
        console.warn(`Failed to parse metadata for ${deploymentName}: ${String(error)}`);
      }
    }

    console.log(`verifying ${deploymentName} (${deployment.address}) on ${network}...`);
    try {
      await hre.run("verify:verify", {
        address: deployment.address,
        constructorArguments,
        contract: fullyQualifiedName,
      });
      console.log(`✅ verified ${deploymentName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  verification skipped for ${deploymentName}: ${message}`);
    }
  }
}

function parseArgs(argv: string[]): VerifyOptions {
  const opts: VerifyOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--match" && argv[i + 1]) {
      opts.match = new RegExp(argv[i + 1]);
      i += 1;
    } else if (arg === "--only" && argv[i + 1]) {
      opts.only = new Set(argv[i + 1].split(","));
      i += 1;
    } else if (arg === "--force") {
      opts.force = true;
    }
  }
  return opts;
}

async function isAlreadyVerified(address: string): Promise<boolean> {
  try {
    const chainIdHex = await hre.network.provider.send("eth_chainId");
    const chainId = parseInt(chainIdHex, 16);
    const chain = hre.config.etherscan.customChains?.find((c) => c.chainId === chainId);
    if (!chain) return false;

    const apiUrl = chain.urls.apiURL;
    const apiKey = resolveApiKey(chain.network, hre.config.etherscan.apiKey);
    if (!apiKey) return false;

    const url = new URL(apiUrl);
    const params = url.searchParams;
    params.set("module", "contract");
    params.set("action", "getsourcecode");
    params.set("address", address);
    params.set("apikey", apiKey);
    url.search = params.toString();

    const res = await fetch(url.toString());
    const json = (await res.json()) as { status?: string; message?: string; result?: Array<{ SourceCode?: string }> };
    if (json.message !== "OK" || !json.result || json.result.length === 0) return false;
    const source = json.result[0]?.SourceCode;
    return Boolean(source);
  } catch {
    return false;
  }
}

function resolveApiKey(network: string, apiKey: unknown): string | undefined {
  if (typeof apiKey === "string") return apiKey;
  if (apiKey && typeof apiKey === "object" && !Array.isArray(apiKey) && network in (apiKey as Record<string, string>)) {
    return (apiKey as Record<string, string>)[network];
  }
  return undefined;
}

void main();
