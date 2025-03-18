-include ./.env

LIQUIDATOR_BOT_IMAGE_NAME:=liquidator-bot

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
	@yarn hardhat compile --show-stack-traces

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

test.hardhat.dusd:
	@echo "Running Hardhat Mocha tests for dUSD contracts only..."
	@yarn hardhat test test/dusd/*.ts

test.curve:
	@echo "Running curve tests..."
	@yarn hardhat test test/curve/*.ts --network local_ethereum

test.unit:
	@echo "Running TypeScript unit tests..."
	@yarn test-ts --detectOpenHandles --testPathPattern=test\\.unit\\.ts --silent --passWithNoTests
#	@echo "Running TypeScript integration tests..."
#	@yarn test-ts --testPathPattern=test\\.integ\\.ts --silent --passWithNoTests

run.node.localhost:
	@echo "Running localhost node..."
	@yarn hardhat node --no-deploy

run.node.local_ethereum:
	@echo "Forking ethereum mainnet..."
	@yarn hardhat node --fork https://mainnet.infura.io/v3/9c52fc4e27554e868b243c18bf9631c7 --fork-block-number 20812145 --no-deploy

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

deploy-liquidator-bot.fraxtal_testnet: network=fraxtal_testnet
deploy-liquidator-bot.fraxtal_testnet: deploy-liquidator-bot

deploy-liquidator-bot.fraxtal_mainnet: network=fraxtal_mainnet
deploy-liquidator-bot.fraxtal_mainnet: deploy-liquidator-bot

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

deploy-contract.localhost: network=localhost
deploy-contract.localhost: deploy-contract

deploy-contract.localhost.reset: network=localhost
deploy-contract.localhost.reset: deploy-contract.reset

# ---------- Deploy to Fraxtal testnet ----------

clean-deployments:
	@if [ "$(deployment_prefix)" = "" ]; then \
		echo "Must provide 'deployment_prefix' argument"; \
		exit 1; \
	fi
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Removing deployments with prefix '$(deployment_prefix)' from deployments/$(network)/.migrations.json..."
	@jq 'with_entries(select(.key | startswith("$(deployment_prefix)") | not))' deployments/$(network)/.migrations.json > temp.json && mv temp.json deployments/$(network)/.migrations.json

deploy-contract.fraxtal_testnet: network=fraxtal_testnet
deploy-contract.fraxtal_testnet: deploy-contract

deploy-contract.fraxtal_testnet.reset: network=fraxtal_testnet
deploy-contract.fraxtal_testnet.reset: deploy-contract.reset

deploy-contract.dloop.fraxtal_testnet: network=fraxtal_testnet
deploy-contract.dloop.fraxtal_testnet: deployment_prefix=DLoopVault
deploy-contract.dloop.fraxtal_testnet: clean-deployments
deploy-contract.dloop.fraxtal_testnet: deploy-contract

deploy-contract.dloop.fraxtal_mainnet: network=fraxtal_mainnet
deploy-contract.dloop.fraxtal_mainnet: deployment_prefix=DLoopVault
deploy-contract.dloop.fraxtal_mainnet: clean-deployments
deploy-contract.dloop.fraxtal_mainnet: deploy-contract

# ---------- Deploy to Fraxtal mainnet ----------

deploy-contract.liquidator-bot:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@make clean-deployments network=$(network) deployment_prefix=FlashLoanLiquidator
	@make clean-deployments network=$(network) deployment_prefix=FlashMintLiquidator
	@make clean-deployments network=$(network) deployment_prefix=CurveHelper
	@echo "Deploying liquidator bot contracts to $(network) network..."
	@yarn hardhat deploy $(flag) --network $(network) --tags "liquidator-bot,curve-helper"

deploy-contract.liquidator-bot.fraxtal_mainnet: network=fraxtal_mainnet
deploy-contract.liquidator-bot.fraxtal_mainnet: deploy-contract.liquidator-bot

deploy-contract.liquidator-bot.fraxtal_testnet: network=fraxtal_testnet
deploy-contract.liquidator-bot.fraxtal_testnet: deploy-contract.liquidator-bot

# ---------- Deploy to local_ethereum ----------

deploy-contract.local_ethereum: network=local_ethereum
deploy-contract.local_ethereum: deploy-contract

deploy-contract.local_ethereum.reset: network=local_ethereum
deploy-contract.local_ethereum.reset: deploy-contract.reset

# ---------- Deploy DUSD contracts ----------

deploy-dusd:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying DUSD contracts to $(network) network..."
	@DEPLOY_DUSD=true yarn hardhat deploy $(flag) --network $(network) --tags "dusd" \
		2>&1 | tee ./deployments-log/$(network)-deploy_dusd.log

deploy-dusd.reset: flag="--reset"
deploy-dusd.reset: deploy-dusd

deploy-dusd.localhost: network=localhost
deploy-dusd.localhost: deploy-dusd

deploy-dusd.localhost.reset: network=localhost
deploy-dusd.localhost.reset: deploy-dusd.reset

deploy-dusd.fraxtal_testnet: network=fraxtal_testnet
deploy-dusd.fraxtal_testnet: deploy-dusd

deploy-dusd.fraxtal_testnet.reset: network=fraxtal_testnet
deploy-dusd.fraxtal_testnet.reset: deploy-dusd.reset

# ---------- Deploy DUSD AMO vaults ----------

deploy-dusd-amo-vault:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Deploying DUSD AMO vault to $(network) network..."
	@DEPLOY_DUSD_AMO_VAULT=true yarn hardhat deploy $(flag) --network $(network) --tags "amo_vault" \
		2>&1 | tee ./deployments-log/$(network)-deploy_dusd_amo_vault.log

deploy-dusd-amo-vault.reset: flag="--reset"
deploy-dusd-amo-vault.reset: deploy-dusd-amo-vault

deploy-dusd-amo-vault.local: network=localhost
deploy-dusd-amo-vault.local: deploy-dusd-amo-vault

deploy-dusd-amo-vault.local.reset: network=localhost
deploy-dusd-amo-vault.local.reset: deploy-dusd-amo-vault.reset

deploy-dusd-amo-vault.fraxtal_testnet: network=fraxtal_testnet
deploy-dusd-amo-vault.fraxtal_testnet: deploy-dusd-amo-vault

deploy-dusd-amo-vault.fraxtal_testnet.reset: network=fraxtal_testnet
deploy-dusd-amo-vault.fraxtal_testnet.reset: deploy-dusd-amo-vault.reset

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

# ---------- Oracle ----------
oracle.set-asset-sources.%:
	@echo "Setting asset sources..."
	@dataFile=$(dataFile) yarn hardhat run \
		--network $* \
		scripts/oracle/set_asset_sources.ts

oracle.set-asset-sources.fraxtal_testnet:
oracle.set-asset-sources.localhost:

oracle.set-mock-price.%:
	@echo "Setting mock price..."
	@price=$(price) yarn hardhat run \
		--network $* \
		scripts/oracle/set_mock_price.ts

oracle.set-mock-price.fraxtal_testnet:
oracle.set-mock-price.localhost:

# ---------- Liquidator Bot ----------
run.liquidator-bot.%:
	@if [ "$(dex)" = "" ]; then \
		echo "Must provide 'dex' argument"; \
		exit 1; \
	fi
	@echo "Running liquidator bot for $(dex)..."
	@yarn hardhat run \
		--network $* \
		scripts/liquidator-bot/$(dex)/run.ts

run.liquidator-bot.fraxtal_testnet:
run.liquidator-bot.localhost:
run.liquidator-bot.fraxtal_mainnet:

## ---------- Docker ----------
docker.build.liquidator-bot: compile # Need pre-compilation as we need to copy the artifacts
docker.build.liquidator-bot:
	@if [ "$(platform)" = "" ]; then \
		echo "Must provide 'platform' argument"; \
		exit 1; \
	fi
	@echo "Building liquidator bot docker image..."
	@docker build \
		--platform $(platform) \
		--pull \
		--build-arg HOST_PWD=$(shell pwd) \
		-f ./bot.Dockerfile \
		-t ${LIQUIDATOR_BOT_IMAGE_NAME}:latest \
		-t ${LIQUIDATOR_BOT_IMAGE_NAME}-$(platform):latest \
		.

docker.build.liquidator-bot.arm64: platform=linux/arm64
docker.build.liquidator-bot.arm64: docker.build.liquidator-bot

docker.build.liquidator-bot.amd64: platform=linux/amd64
docker.build.liquidator-bot.amd64: docker.build.liquidator-bot

docker.buildandrun.liquidator-bot.arm64: platform=linux/arm64
docker.buildandrun.liquidator-bot.arm64: docker.build.liquidator-bot
docker.buildandrun.liquidator-bot.arm64:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi	
	@if [ "$(dex)" = "" ]; then \
		echo "Must provide 'dex' argument"; \
		exit 1; \
	fi
	@mkdir -p ./state
	@echo "Running liquidator bot docker image..."
	@docker run \
		-d \
		-v $(shell pwd)/.env:/usr/src/.env:ro \
		-v $(shell pwd)/state:/usr/src/state \
		--memory 768m \
		--restart unless-stopped \
		--platform $(platform) \
		--name ${LIQUIDATOR_BOT_IMAGE_NAME}-$(network)-$(dex) \
		${LIQUIDATOR_BOT_IMAGE_NAME}:latest $(network) $(dex)

docker.buildandrun.liquidator-bot.slack-bot: docker.build.liquidator-bot
docker.buildandrun.liquidator-bot.slack-bot:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@if [ "$(platform)" = "" ]; then \
		echo "Must provide 'platform' argument"; \
		exit 1; \
	fi
	@echo "Running slack bot..."
	@docker run \
		-d \
		-v $(shell pwd)/.env:/usr/src/.env:ro \
		--memory 768m \
		--restart unless-stopped \
		--entrypoint /usr/src/scripts/docker-entrypoint-slack-bot.sh \
		--platform $(platform) \
		--name ${LIQUIDATOR_BOT_IMAGE_NAME}-slack-bot \
		${LIQUIDATOR_BOT_IMAGE_NAME}:latest $(network) 10

docker.buildandrun.liquidator-bot.slack-bot.amd64: platform=linux/amd64
docker.buildandrun.liquidator-bot.slack-bot.amd64: docker.buildandrun.liquidator-bot.slack-bot

docker.buildandrun.liquidator-bot.slack-bot.arm64: platform=linux/arm64
docker.buildandrun.liquidator-bot.slack-bot.arm64: docker.buildandrun.liquidator-bot.slack-bot

docker.dump-image.liquidator-bot:
	@if [ "$(output_file_name)" = "" ]; then \
		echo "Must provide 'output_file_name' argument"; \
		exit 1; \
	fi
	@echo "Exporting docker image to ./.tmp/$(output_file_name).tar..."
	@mkdir -p .tmp
	@docker save ${LIQUIDATOR_BOT_IMAGE_NAME}:latest > .tmp/$(output_file_name).tar

docker.buildanddump-image.liquidator-bot: docker.build.liquidator-bot
docker.buildanddump-image.liquidator-bot: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}
docker.buildanddump-image.liquidator-bot: docker.dump-image.liquidator-bot

docker.buildanddump-image.liquidator-bot.arm64: platform=linux/arm64
docker.buildanddump-image.liquidator-bot.arm64: docker.build.liquidator-bot
docker.buildanddump-image.liquidator-bot.arm64: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}-arm64
docker.buildanddump-image.liquidator-bot.arm64: docker.dump-image.liquidator-bot

docker.buildanddump-image.liquidator-bot.amd64: platform=linux/amd64
docker.buildanddump-image.liquidator-bot.amd64: docker.build.liquidator-bot
docker.buildanddump-image.liquidator-bot.amd64: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}-amd64
docker.buildanddump-image.liquidator-bot.amd64: docker.dump-image.liquidator-bot

docker.deploy.liquidator-bot: container_name=${LIQUIDATOR_BOT_IMAGE_NAME}-$(network)-$(dex)
docker.deploy.liquidator-bot: state_dir_name=$(network)-$(dex)
docker.deploy.liquidator-bot:
	@if [ "$(platform)" = "" ]; then \
		echo "Must provide 'platform' argument"; \
		exit 1; \
	fi
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@if [ "$(dex)" = "" ]; then \
		echo "Must provide 'dex' argument"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_SSH_KEY_PATH}" = "" ]; then \
		echo "LIQUIDATOR_BOT_SSH_KEY_PATH is not set in .env"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_HOST}" = "" ]; then \
		echo "LIQUIDATOR_BOT_HOST is not set in .env"; \
		exit 1; \
	fi
	@make remote.upload \
		file_path=./.env \
		dest_path=/home/ubuntu/.env
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"mkdir -p /home/ubuntu/state/$(state_dir_name)"
	@(ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker rm -f ${container_name} || true") && \
	ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker run \
			-d \
			-v /home/ubuntu/.env:/usr/src/.env:ro \
			-v /home/ubuntu/state/$(state_dir_name):/usr/src/state \
			--memory 512m \
			--restart unless-stopped \
			--platform $(platform) \
			--name ${container_name} \
			${LIQUIDATOR_BOT_IMAGE_NAME}:latest $(network) $(dex)"
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker image prune -f"

docker.deploy.liquidator-bot.fraxtal_testnet: network=fraxtal_testnet
docker.deploy.liquidator-bot.fraxtal_testnet: docker.deploy.liquidator-bot

docker.deploy.liquidator-bot.fraxtal_mainnet: network=fraxtal_mainnet
docker.deploy.liquidator-bot.fraxtal_mainnet: docker.deploy.liquidator-bot

docker.deploy.liquidator-bot.slack-bot: healthFactorBatchSize=1
docker.deploy.liquidator-bot.slack-bot:
	@if [ "$(platform)" = "" ]; then \
		echo "Must provide 'platform' argument"; \
		exit 1; \
	fi
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@if [ "$(healthFactorBatchSize)" = "" ]; then \
		echo "Must provide 'healthFactorBatchSize' argument"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_SSH_KEY_PATH}" = "" ]; then \
		echo "LIQUIDATOR_BOT_SSH_KEY_PATH is not set in .env"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_HOST}" = "" ]; then \
		echo "LIQUIDATOR_BOT_HOST is not set in .env"; \
		exit 1; \
	fi
	@make remote.upload \
		file_path=./.env \
		dest_path=/home/ubuntu/.env
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker rm -f ${LIQUIDATOR_BOT_IMAGE_NAME}-slack-bot || true"
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker run \
			-d \
			-v /home/ubuntu/.env:/usr/src/.env:ro \
			--entrypoint /usr/src/scripts/docker-entrypoint-slack-bot.sh \
			--cpus 0.5 \
			--memory 512m \
			--restart unless-stopped \
			--platform $(platform) \
			--name ${LIQUIDATOR_BOT_IMAGE_NAME}-slack-bot \
			${LIQUIDATOR_BOT_IMAGE_NAME}:latest $(network) $(healthFactorBatchSize)"
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker image prune -f"

docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: network=fraxtal_testnet
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: platform=linux/amd64
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: docker.build.liquidator-bot
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: remote.push-image.liquidator-bot
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: dex=curve
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: docker.deploy.liquidator-bot

docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: dex=curve
docker.buildanddeploy.liquidator-bot.fraxtal_testnet.curve: docker.buildanddeploy.liquidator-bot.fraxtal_testnet

docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: network=fraxtal_mainnet
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: platform=linux/amd64
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: docker.build.liquidator-bot
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: remote.push-image.liquidator-bot
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet: docker.deploy.liquidator-bot.fraxtal_mainnet

docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.curve: dex=curve
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.curve: docker.buildanddeploy.liquidator-bot.fraxtal_mainnet

docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.odos: dex=odos
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.odos: docker.buildanddeploy.liquidator-bot.fraxtal_mainnet

docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.combo: dex=combo
docker.buildanddeploy.liquidator-bot.fraxtal_mainnet.combo: docker.buildanddeploy.liquidator-bot.fraxtal_mainnet

docker.buildanddeploy.liquidator-bot.slack-bot: platform=linux/amd64
docker.buildanddeploy.liquidator-bot.slack-bot: docker.build.liquidator-bot
docker.buildanddeploy.liquidator-bot.slack-bot: output_file_name=${LIQUIDATOR_BOT_IMAGE_NAME}
docker.buildanddeploy.liquidator-bot.slack-bot: remote.push-image.liquidator-bot
docker.buildanddeploy.liquidator-bot.slack-bot: docker.deploy.liquidator-bot.slack-bot

docker.buildanddeploy.liquidator-bot.slack-bot.fraxtal_mainnet: network=fraxtal_mainnet
docker.buildanddeploy.liquidator-bot.slack-bot.fraxtal_mainnet: docker.buildanddeploy.liquidator-bot.slack-bot

## ---------- Remote host ----------

remote.ssh.liquidator-bot:
	@if [ "${LIQUIDATOR_BOT_SSH_KEY_PATH}" = "" ]; then \
		echo "LIQUIDATOR_BOT_SSH_KEY_PATH is not set in .env"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_HOST}" = "" ]; then \
		echo "LIQUIDATOR_BOT_HOST is not set in .env"; \
		exit 1; \
	fi
	@echo "SSH into liquidator bot remote host..."
	@ssh -i ${LIQUIDATOR_BOT_SSH_KEY_PATH} ubuntu@${LIQUIDATOR_BOT_HOST}

remote.upload:
	@if [ "$(file_path)" = "" ]; then \
		echo -e "Must provide file_path argument"; \
		exit 1; \
	fi && \
	if [ "$(dest_path)" = "" ]; then \
		echo -e "Must provide dest_path argument"; \
		exit 1; \
	fi
	@$(eval host_dest_path="ubuntu@${LIQUIDATOR_BOT_HOST}:$(dest_path)")
	@echo "Uploading file $(file_path) to $(host_dest_path)"
	@rsync -h -P -e "ssh -i ${LIQUIDATOR_BOT_SSH_KEY_PATH}" -a $(file_path) $(host_dest_path)

remote.push-image.liquidator-bot: docker.dump-image.liquidator-bot
remote.push-image.liquidator-bot: file_path=.tmp/${LIQUIDATOR_BOT_IMAGE_NAME}.tar
remote.push-image.liquidator-bot: dest_path=/home/ubuntu/${LIQUIDATOR_BOT_IMAGE_NAME}.tar
remote.push-image.liquidator-bot: remote.upload
remote.push-image.liquidator-bot:
	@$(eval image_path=/home/ubuntu/${LIQUIDATOR_BOT_IMAGE_NAME}.tar)
	@echo "Loading docker image $(image_path) on host $(LIQUIDATOR_BOT_HOST)"
	@ssh -i $(LIQUIDATOR_BOT_SSH_KEY_PATH) ubuntu@$(LIQUIDATOR_BOT_HOST) \
		"docker load -i $(image_path) && rm -r $(image_path)"

remote.download.liquidator-bot-state: remote_state_path=./remote-state
remote.download.liquidator-bot-state:
	@if [ "${LIQUIDATOR_BOT_SSH_KEY_PATH}" = "" ]; then \
		echo "LIQUIDATOR_BOT_SSH_KEY_PATH is not set in .env"; \
		exit 1; \
	fi
	@if [ "${LIQUIDATOR_BOT_HOST}" = "" ]; then \
		echo "LIQUIDATOR_BOT_HOST is not set in .env"; \
		exit 1; \
	fi
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Downloading liquidator bot state from remote host..."
	@$(eval timestamp=$(shell date "+%Y-%m-%d_%H-%M-%S"))
	@$(eval dest_path=$(remote_state_path)/$(network)/$(timestamp))
	@mkdir -p $(dest_path)
	@rsync -azh --progress -e "ssh -i ${LIQUIDATOR_BOT_SSH_KEY_PATH}" \
		"ubuntu@${LIQUIDATOR_BOT_HOST}:/home/ubuntu/state/$(network)/" \
		$(dest_path)


remote.download.liquidator-bot-state.fraxtal_testnet: network=fraxtal_testnet
remote.download.liquidator-bot-state.fraxtal_testnet: remote.download.liquidator-bot-state

## ---------- Curve tools ----------

curve-tools.generate-swap-params:
	@echo "Check scripts/curve-tools/README.md for usage"

## ---------- Block explorer ----------
explorer.verify.fraxtal_testnet:
	@echo "Verifying contracts on fraxtal testnet..."
	@yarn hardhat --network fraxtal_testnet etherscan-verify --api-key AMT6AWIRDZV3RVNSSU6T2638K59QSX4Q89 --api-url https://api-holesky.fraxscan.com

explorer.verify.fraxtal_mainnet:
	@echo "Verifying contracts on fraxtal mainnet..."
	@yarn hardhat --network fraxtal_mainnet etherscan-verify --api-key AMT6AWIRDZV3RVNSSU6T2638K59QSX4Q89 --api-url https://api.fraxscan.com

check-all-users-health-factor:
	@if [ "$(network)" = "" ]; then \
		echo "Must provide 'network' argument"; \
		exit 1; \
	fi
	@echo "Checking health factor on $(network)..."
	@yarn hardhat run \
		--network $(network) \
		scripts/liquidator-bot/curve/check-all-user-health-factors.ts

check-all-users-health-factor.fraxtal_testnet: network=fraxtal_testnet
check-all-users-health-factor.fraxtal_testnet: check-all-users-health-factor

check-all-users-health-factor.fraxtal_mainnet: network=fraxtal_mainnet
check-all-users-health-factor.fraxtal_mainnet: check-all-users-health-factor

## ---------- Utility ----------
zip-directory:
	@if [ "$(directory)" = "" ]; then \
		echo "Must provide 'directory' argument"; \
		exit 1; \
	fi
	@echo "Zipping directory $(directory)..."
	@cd $(directory)/.. && zip -r $(shell basename $(directory)).zip $(shell basename $(directory))

## ---------- Public code publishing----------

copy-to-public:
	@echo "Copying git-tracked files to ../public-solidity-contracts..."
	@if [ ! -d "../public-solidity-contracts" ]; then \
		echo "Error: ../public-solidity-contracts directory does not exist"; \
		exit 1; \
	fi
	@# Create a temporary directory for git tracked files
	@mkdir -p .tmp/public-copy
	@# Copy only git tracked files to temp directory
	@git ls-files | tar -T - -cf - | (cd .tmp/public-copy && tar -xf -)
	@# Copy files from temp to destination, preserving destination's .git directory
	@rsync -av \
		--exclude '.git/' \
		.tmp/public-copy/ \
		../public-solidity-contracts/
	@# Clean up temp directory
	@rm -rf .tmp/public-copy
	@echo "Files copied successfully. Note: You'll need to commit changes in ../public-solidity-contracts manually"

create-public-docker-image.liquidator-bot.arm64: docker.buildanddump-image.liquidator-bot.arm64
create-public-docker-image.liquidator-bot.arm64:
	@if [ "$(output_dir)" = "" ]; then \
		echo "Must provide 'output_dir' argument"; \
		exit 1; \
	fi
	@echo "Creating public docker image for arm64 in $(output_dir)"
	@mkdir -p "$(output_dir)"; \
	cp -r liquidator-bot-image/materials/arm64 "$(output_dir)/"; \
	cp .tmp/${LIQUIDATOR_BOT_IMAGE_NAME}-arm64.tar "$(output_dir)/arm64"; \
	make zip-directory directory="$(output_dir)/arm64"; \
	echo "Docker images saved to $(output_dir)"

create-public-docker-image.liquidator-bot.amd64: docker.buildanddump-image.liquidator-bot.amd64
create-public-docker-image.liquidator-bot.amd64:
	@if [ "$(output_dir)" = "" ]; then \
		echo "Must provide 'output_dir' argument"; \
		exit 1; \
	fi
	@echo "Creating public docker image for amd64 in $(output_dir)"
	@mkdir -p "$(output_dir)"; \
	cp -r liquidator-bot-image/materials/amd64-x86_64 "$(output_dir)/"; \
	cp .tmp/${LIQUIDATOR_BOT_IMAGE_NAME}-amd64.tar "$(output_dir)/amd64-x86_64"; \
	make zip-directory directory="$(output_dir)/amd64-x86_64"; \
	echo "Docker images saved to $(output_dir)"

create-public-docker-image.liquidator-bot.all: output_dir=./liquidator-bot-image/$(shell date "+%Y-%m-%d_%H-%M-%S")
create-public-docker-image.liquidator-bot.all:
	@make create-public-docker-image.liquidator-bot.arm64 output_dir=$(output_dir)
	@make create-public-docker-image.liquidator-bot.amd64 output_dir=$(output_dir)
