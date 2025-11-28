#!/usr/bin/env ts-node

import { spawnSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { createRequire } from 'module';

import { logger } from '../../lib/logger';
import { validateHardhatProject } from '../../lib/validators';
import { findProjectRoot, loadProjectModule } from '../../lib/utils';
import { runAllLinting } from '../linting/run-all';
import { runSolhint } from '../analysis/solhint';

interface GuardrailOptions {
  skipLint?: boolean;
  skipPrettier?: boolean;
  skipEslint?: boolean;
  skipTypecheck?: boolean;
  skipSolhint?: boolean;
  write?: boolean;
  eslintFix?: boolean;
  eslintMaxWarnings?: number;
  eslintQuiet?: boolean;
  prettierConfig?: string;
  eslintConfig?: string;
  tsconfig?: string;
  solhintConfig?: string;
  solhintFormatter?: string;
  solhintMaxWarnings?: number;
  solhintQuiet?: boolean;
  network?: string;
  failFast?: boolean;
}

function logValidation(label: string, errors: string[], warnings: string[]): void {
  if (warnings.length > 0) {
    warnings.forEach(message => logger.warn(`${label} warning: ${message}`));
  }
  if (errors.length > 0) {
    errors.forEach(message => logger.error(`${label} error: ${message}`));
  }
}

export async function runGuardrails(options: GuardrailOptions = {}): Promise<boolean> {
  logger.info('Running shared guardrail checks');

  const projectValidation = validateHardhatProject();
  logValidation('Project', projectValidation.errors, projectValidation.warnings);
  if (!projectValidation.valid) {
    logger.error('Guardrail checks aborted: project validation failed.');
    return false;
  }

  const projectRoot = findProjectRoot();
  const resolvedTsconfig = resolveTsconfigPath(projectRoot, options.tsconfig);
  const shouldTypecheck = !options.skipTypecheck && !!resolvedTsconfig;
  const requiredTools: string[] = [];
  if (!(options.skipLint || options.skipPrettier)) {
    requiredTools.push('prettier');
  }
  if (!(options.skipLint || options.skipEslint)) {
    requiredTools.push('eslint');
  }
  if (shouldTypecheck) {
    requiredTools.push('typescript');
  }
  if (!options.skipSolhint) {
    requiredTools.push('solhint');
  }

  const missingTools = requiredTools.filter(tool => !loadProjectModule(tool, projectRoot));
  if (missingTools.length > 0) {
    missingTools.forEach(tool => logger.error(`Tooling error: Required tool '${tool}' is not installed`));
    logger.error('Guardrail checks aborted: required tooling missing.');
    return false;
  }

  let overallSuccess = true;

  const shouldCheckLockfile = process.env.SHARED_HARDHAT_SKIP_INSTALL_CHECK !== '1' && needsLockfileVerification();
  if (shouldCheckLockfile) {
    const lockSuccess = ensureImmutableInstall();
    overallSuccess = overallSuccess && lockSuccess;
    if (!lockSuccess && options.failFast) {
      return false;
    }
  } else if (process.env.SHARED_HARDHAT_SKIP_INSTALL_CHECK === '1') {
    logger.info('Skipping lockfile verification (SHARED_HARDHAT_SKIP_INSTALL_CHECK=1).');
  }

  if (!options.skipLint) {
    const lintSuccess = await runAllLinting({
      skipPrettier: options.skipPrettier,
      skipEslint: options.skipEslint,
      prettier: {
        write: options.write,
        config: options.prettierConfig,
      },
      eslint: {
        config: options.eslintConfig,
        fix: options.eslintFix,
        maxWarnings: options.eslintMaxWarnings,
        quiet: options.eslintQuiet,
      },
    });
    overallSuccess = overallSuccess && lintSuccess;
    if (!lintSuccess && options.failFast) {
      return false;
    }
  } else {
    logger.info('Skipping linting checks.');
  }

  if (!options.skipTypecheck) {
    logger.info('\n=== TypeScript ===');
    if (!resolvedTsconfig) {
      if (options.tsconfig) {
        logger.error(`Specified tsconfig '${options.tsconfig}' was not found; cannot run type-check.`);
        overallSuccess = false;
        if (options.failFast) {
          return false;
        }
      } else {
        logger.warn('No tsconfig file found; skipping type-check.');
      }
    } else {
      const typecheckSuccess = runTypeCheck({
        projectRoot,
        tsconfigPath: resolvedTsconfig,
      });
      overallSuccess = overallSuccess && typecheckSuccess;
      if (!typecheckSuccess && options.failFast) {
        return false;
      }
    }
  } else {
    logger.info('Skipping TypeScript type-check.');
  }

  if (!options.skipSolhint) {
    logger.info('\n=== Solhint ===');
    const solhintOptions: Parameters<typeof runSolhint>[0] = {
      network: options.network,
      configFile: options.solhintConfig,
      formatter: options.solhintFormatter,
      quiet: options.solhintQuiet,
      maxWarnings: options.solhintMaxWarnings,
    };
    const solhintSuccess = runSolhint(solhintOptions);
    overallSuccess = overallSuccess && solhintSuccess;
    if (!solhintSuccess && options.failFast) {
      return false;
    }
  } else {
    logger.info('Skipping Solhint checks.');
  }

  if (overallSuccess) {
    logger.success('\nAll guardrail checks passed.');
  } else {
    logger.error('\nGuardrail checks failed.');
  }

  return overallSuccess;
}

function needsLockfileVerification(): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!status.trim()) {
      return false;
    }
    return status
      .trim()
      .split('\n')
      .some(line => {
        const file = line.slice(3).trim();
        return file === 'yarn.lock' || file.startsWith('.shared/');
      });
  } catch (error) {
    logger.warn('Unable to inspect git status; running lockfile verification defensively.', error);
    return true;
  }
}

function ensureImmutableInstall(): boolean {
  logger.info('\n=== Dependency Lock ===');
  logger.info('Running `yarn install --immutable` to verify lockfile integrity.');
  const result = spawnSync('yarn', ['install', '--immutable'], {
    stdio: 'inherit',
    env: { ...process.env, YARN_ENABLE_GLOBAL_CACHE: process.env.YARN_ENABLE_GLOBAL_CACHE ?? 'false' },
  });

  if (result.status !== 0) {
    logger.error('Lockfile verification failed. Run `yarn install --mode=update-lockfile` to regenerate the lockfile after syncing .shared.');
    return false;
  }

  logger.success('Lockfile integrity check passed.');
  return true;
}

interface TypecheckOptions {
  projectRoot: string;
  tsconfigPath: string | null;
}

function resolveTsconfigPath(projectRoot: string, override?: string): string | null {
  const candidates = [
    override,
    process.env.TS_NODE_PROJECT,
    'tsconfig.shared.json',
    'tsconfig.hardhat.json',
    'tsconfig.build.json',
    'tsconfig.json',
  ].filter((candidate): candidate is string => !!candidate);

  for (const candidate of candidates) {
    const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

function runTypeCheck({ projectRoot, tsconfigPath }: TypecheckOptions): boolean {
  if (!tsconfigPath) {
    logger.warn('No tsconfig file found; skipping type-check.');
    return true;
  }

  const relativeConfig = path.relative(projectRoot, tsconfigPath) || tsconfigPath;
  logger.info(`Running \`tsc --noEmit\` (tsconfig: ${relativeConfig})`);

  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  let tscEntryPoint: string;
  try {
    tscEntryPoint = requireFromProject.resolve('typescript/lib/tsc');
  } catch (error) {
    logger.error('Unable to locate the local TypeScript compiler. Ensure `typescript` is installed in this project.');
    logger.debug('Failed to resolve TypeScript compiler:', error);
    return false;
  }

  const result = spawnSync(process.execPath, [tscEntryPoint, '--noEmit', '--pretty', 'false', '--project', tsconfigPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    logger.error('TypeScript type-check failed.');
    return false;
  }

  logger.success('TypeScript type-check passed.');
  return true;
}

if (require.main === module) {
  const program = new Command();

  program
    .description('Run shared guardrail checks (linting, formatting, TypeScript, Solhint).')
    .option('--skip-lint', 'Skip linting and formatting checks.')
    .option('--skip-prettier', 'Skip Prettier checks.')
    .option('--skip-eslint', 'Skip ESLint checks.')
    .option('--skip-typecheck', 'Skip TypeScript type-checks.')
    .option('--skip-solhint', 'Skip Solhint checks.')
    .option('--write', 'Allow Prettier to write formatting changes.')
    .option('--eslint-fix', 'Run ESLint with --fix.')
    .option('--eslint-config <path>', 'Path to an ESLint configuration file.')
    .option('--prettier-config <path>', 'Path to a Prettier configuration file.')
    .option('--tsconfig <path>', 'Path to a tsconfig file for type-checking.')
    .option('--eslint-max-warnings <count>', 'Maximum allowed ESLint warnings before failure.', (value: string) => parseInt(value, 10))
    .option('--eslint-quiet', 'Run ESLint in quiet mode.')
    .option('--solhint-config <path>', 'Path to a Solhint configuration file.')
    .option('--solhint-formatter <name>', 'Solhint formatter to use.')
    .option('--solhint-max-warnings <count>', 'Maximum allowed Solhint warnings before failure.', (value: string) => parseInt(value, 10))
    .option('--solhint-quiet', 'Run Solhint in quiet mode.')
    .option('--network <name>', 'Network name to pass through to Solhint config resolution.')
    .option('--fail-fast', 'Stop after the first failure.');

  program.parse(process.argv);

  const opts = program.opts();
  const eslintMaxWarnings =
    typeof opts.eslintMaxWarnings === 'number' && !Number.isNaN(opts.eslintMaxWarnings)
      ? opts.eslintMaxWarnings
      : undefined;
  const solhintMaxWarnings =
    typeof opts.solhintMaxWarnings === 'number' && !Number.isNaN(opts.solhintMaxWarnings)
      ? opts.solhintMaxWarnings
      : undefined;

  runGuardrails({
    skipLint: Boolean(opts.skipLint),
    skipPrettier: Boolean(opts.skipPrettier),
    skipEslint: Boolean(opts.skipEslint),
    skipTypecheck: Boolean(opts.skipTypecheck),
    skipSolhint: Boolean(opts.skipSolhint),
    write: Boolean(opts.write),
    eslintFix: Boolean(opts.eslintFix),
    eslintConfig: opts.eslintConfig,
    prettierConfig: opts.prettierConfig,
    tsconfig: opts.tsconfig,
    eslintMaxWarnings,
    eslintQuiet: Boolean(opts.eslintQuiet),
    solhintConfig: opts.solhintConfig,
    solhintFormatter: opts.solhintFormatter,
    solhintMaxWarnings,
    solhintQuiet: Boolean(opts.solhintQuiet),
    network: opts.network,
    failFast: Boolean(opts.failFast),
  }).then(success => {
    process.exit(success ? 0 : 1);
  });
}
