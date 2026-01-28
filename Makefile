.PHONY: all help install build synth deploy clean test

# Default target
all: help

# Display help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install    Install all dependencies (mise, npm)"
	@echo "  build      Compile the cdk8s TypeScript code"
	@echo "  synth      Synthesize Kubernetes manifests from cdk8s"
	@echo "  test       Run tests"
	@echo "  deploy     Apply the synthesized manifests to the current context"
	@echo "  clean      Remove build artifacts"

# Install tools and dependencies
install:
	@echo "Installing tools via mise..."
	mise install
	@echo "Installing cdk8s dependencies..."
	cd cdk8s && npm install

# Compile TypeScript
build:
	@echo "Compiling cdk8s..."
	cd cdk8s && npm run compile

# Synthesize manifests
synth: build
	@echo "Synthesizing manifests..."
	cd cdk8s && npm run synth

# Run tests
test:
	@echo "Running tests..."
	cd cdk8s && npm test

# Deploy to Kubernetes
deploy: synth
	@echo "Deploying to Kubernetes..."
	kubectl apply -f cdk8s/dist/

# Clean artifacts
clean:
	@echo "Cleaning up..."
	rm -rf cdk8s/dist
	rm -rf cdk8s/node_modules
	rm -f cdk8s/package-lock.json
