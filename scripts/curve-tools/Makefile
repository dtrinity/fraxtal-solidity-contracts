docker.build:
	docker build -t curve-tools .

docker.run-server:
	docker run -d -p 3000:3000 curve-tools yarn start

docker.run-cli:
	docker run --rm curve-tools yarn cli "$@"

run.server:
	yarn start

run.cli:
	yarn cli "$@"