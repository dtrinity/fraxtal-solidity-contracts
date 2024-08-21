-include ./.env

# Always try to create the deployments-log directory
$(shell mkdir -p deployments-log)

install: install.ci
install:
	@if [ ! -f .env ]; then \
		echo "Creating .env file..."; \
		cp .env.example .env; \
	fi
	@echo "Installing pre-commit hooks..."
	@if ! command -v pre-commit &> /dev/null; then \
		echo "pre-commit is not installed.\n" \
			"Please follow the instruction in https://pre-commit.com/#install"; \
		exit 1; \
	fi
	@pre-commit install --install-hooks

install.ci:
	@echo "Installing"
	@yarn install

clean:
	@yarn hardhat clean

lint.typescript.ci:
	@echo "Linting check TypeScript..."
	@yarn ts-lint
	@echo "Type-checking TypeScript..."
	@yarn ts-typecheck

lint.typescript:
	@echo "Linting check and fixing TypeScript..."
	@yarn ts-lint-fix

lint.contract.ci:
	@echo "Prettier check Solidity contracts..."
	@yarn prettier --check --plugin=prettier-plugin-solidity 'contracts/**/*.sol'
	@echo "Linting check Solidity contracts..."
	@yarn solhint "contracts/**/*.sol"

lint.contract:
	@echo "Reformatting Solidity contracts..."
	@yarn prettier --write --plugin=prettier-plugin-solidity 'contracts/**/*.sol'
	@echo "Linting check Solidity contracts..."
	@yarn solhint "contracts/**/*.sol"

lint: lint.typescript
lint: lint.contract

lint.ci: lint.typescript.ci
lint.ci: lint.contract.ci

git.unstaged-check.ci:
	@echo "Checking for unstaged changes..."
	@if [ "`git status --porcelain`" != "" ]; then \
		echo ""; \
		echo "Changes detected. Please commit all of these changes"; \
		echo "-----------------------------"; \
		git status --porcelain; \
		echo "-----------------------------"; \
		exit 1; \
	else \
		echo "No changes detected."; \
	fi

compile:
	@echo "Compiling..."
	@yarn hardhat compile

compute.dex.pool-init-code: compile
compute.dex.pool-init-code:
	@echo "------------------------------"
	@echo "Computing DEX pool init code..."
	@yarn ts-node scripts/dex/compute_pool_init_code.ts

test.lbp.legacy:
	@echo "Copying lending contracts to test env..."
	@mkdir -p ./legacy-tests/lending-periphery/contracts
	@cp -r ./contracts/lending ./legacy-tests/lending-periphery/contracts
	@cp -r ./contracts/dependencies ./legacy-tests/lending-periphery/contracts
	@echo "Running lending-periphery tests..."
	@cd ./legacy-tests/lending-periphery && npm run test

test.hardhat:
	@echo "Running hardhat mocha tests..."
	@yarn hardhat test

test.unit:
	@echo "Running TypeScript unit tests..."
	@yarn test-ts --detectOpenHandles --testPathPattern=test\\.unit\\.ts --silent --passWithNoTests
#	@echo "Running TypeScript integration tests..."
#	@yarn test-ts --testPathPattern=test\\.integ\\.ts --silent --passWithNoTests

run.local-node:
	@echo "Running local node..."
	@yarn hardhat node --no-deploy

sync-laika:
	@if [ "$(contract)" = "" ]; then \
		echo "Must provide 'contract' argument"; \
		exit 1; \
	fi
	@yarn hardhat laika-sync --contract $(contract)

# Deploy smart contracts to a network

deploy-mint.tokens:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying mint contract to testnet and minting test tokens..."
	@yarn hardhat run \
		--config ./hardhat.config.token.ts \
		--network $(network) scripts/deploy_mint_testnet_tokens.ts \
		2>&1 | tee ./deployments-log/$(network)-deploy_mint_test_tokens.log

mint.tokens:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Minting test tokens..."
	@yarn hardhat run \
		--config ./hardhat.config.token.ts \
		--network $(network) scripts/mint_test_token.ts

deploy-price-aggregators:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying price aggregators to $(network) network..."
	@yarn hardhat run \
		--config ./hardhat.config.price-aggregator.ts \
		--network $(network) scripts/lending/deploy_mock_aggregator/deploy_price_aggregators.ts \
		2>&1 | tee ./deployments-log/$(network)-deploy_price_aggregators.log

deploy-and-point-price-aggregators:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying price aggregators to $(network) network..."
	@yarn hardhat run \
		--config ./hardhat.config.ts \
		--network $(network) scripts/lending/deploy_mock_aggregator/deploy_point_price_aggregators.ts \
		2>&1 | tee ./deployments-log/$(network)-deploy_point_price_aggregators.log

unset-price-aggregators:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Unsetting price aggregators on $(network) network..."
	@yarn hardhat run \
		--config ./hardhat.config.ts \
		--network $(network) scripts/lending/deploy_mock_aggregator/unpoint_price_aggregators.ts

deploy-test-weth9:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying WETH9 to $(network) network..."
	@yarn hardhat run \
		--config ./hardhat.config.ts \
		--network $(network) scripts/deploy_test_weth9.ts \
		2>&1 | tee ./deployments-log/$(network)-deploy_test_weth9.log

deploy-liquidator-bot:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying liquidator bot with flag [$(flag)] to $(network) network..."
	@yarn hardhat deploy $(flag) --network $(network) --tags "liquidator-bot"

deploy-liquidator-bot.reset: flag="--reset"
deploy-liquidator-bot.reset: deploy-liquidator-bot

deploy-contract:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying with flag [$(flag)] to $(network) network..."
	@yarn hardhat deploy $(flag) --network $(network) \
		2>&1 | tee ./deployments-log/$(network)-deploy_core.log

deploy-contract.reset: flag="--reset"
deploy-contract.reset: deploy-contract

# ---------- Deploy to local network ----------

deploy-contract.local: network=localhost
deploy-contract.local: deploy-contract

deploy-contract.local.reset: network=localhost
deploy-contract.local.reset: deploy-contract.reset

# ---------- Deploy to Fraxtal testnet ----------

deploy-contract.fraxtal_testnet: network=fraxtal_testnet
deploy-contract.fraxtal_testnet: deploy-contract

deploy-contract.fraxtal_testnet.reset: network=fraxtal_testnet
deploy-contract.fraxtal_testnet.reset: deploy-contract.reset

# ---------- Pool initialization ----------
init-pool.dex.%:
	@echo "Initializing DEX pool..."
	@yarn hardhat run \
		--network $* \
		scripts/dex/init_pool/$*.ts

init-pool.dex.fraxtal_testnet:

# ---------- Add liquidity to pool ----------
add-pool-liquidity.dex.%:
	@echo "Adding liquidity to DEX pool..."
	@yarn hardhat run \
		--network $* \
		scripts/dex/add_pool_liquidity/$*.ts

add-pool-liquidity.dex.fraxtal_testnet:

# ---------- Execute swap ----------

swap.dex.%:
	@echo "Swapping tokens in DEX..."
	@yarn hardhat run \
		--network $* \
		scripts/dex/execute_swap/$*.ts

swap.dex.fraxtal_testnet:

# ---------- Check pool state ----------
check-pool-state.dex.%:
	@echo "Checking DEX pool state..."
	@yarn hardhat run \
		--network $* \
		scripts/dex/check_pool_state/$*.ts

check-pool-state.dex.fraxtal_testnet:

# ---------- Lending Rewards ----------
lending.get-emission-admin.%:
	@echo "Getting emission admin..."
	@reward=$(reward) yarn hardhat run \
		--network $* \
		scripts/lending/rewards/get_emission_admin.ts

lending.get-emission-admin.fraxtal_testnet:
lending.get-emission-admin.localhost:

lending.set-emission-admin.%:
	@echo "Setting emission admin..."
	@reward=$(reward) yarn hardhat run \
		--network $* \
		scripts/lending/rewards/set_emission_admin.ts

lending.set-emission-admin.fraxtal_testnet:
lending.set-emission-admin.localhost:

lending.get-rewards-data.%:
	@echo "Getting rewards data..."
	@queryFile=$(queryFile) yarn hardhat run \
		--network $* \
		scripts/lending/rewards/get_rewards_data.ts

lending.get-rewards-data.fraxtal_testnet:
lending.get-rewards-data.localhost:

lending.configure-incentives.%:
	@echo "Configuring rewards asset..."
	@dataFile=$(dataFile) yarn hardhat run \
		--network $* \
		scripts/lending/rewards/configure_asset.ts

lending.configure-incentives.fraxtal_testnet:
lending.configure-incentives.localhost:

lending.deposit-reward.%:
	@echo "Depositing reward..."
	@read -p "Enter wallet private key: " privateKey; \
	reward=$(reward) amount=$(amount) privateKey=$$privateKey yarn hardhat run \
		--network $* scripts/lending/rewards/deposit_fund_to_controller.ts

lending.deposit-reward.fraxtal_testnet:
lending.deposit-reward.localhost:

lending.set-reserve-config.%:
	@echo "Setting reserve config..."
	@dataFile=$(dataFile) yarn hardhat run \
		--network $* \
		scripts/lending/reserve_configs/set_reserve_config.ts

lending.set-reserve-config.fraxtal_testnet:
lending.set-reserve-config.localhost:

# ---------- Liquidator Bot ----------
run.liquidator-bot.%:
	@echo "Running liquidator bot..."
	@yarn hardhat run \
		--network $* \
		scripts/liquidator-bot/run.ts

run.liquidator-bot.fraxtal_testnet:
run.liquidator-bot.localhost:
run.liquidator-bot.fraxtal_mainnet:
