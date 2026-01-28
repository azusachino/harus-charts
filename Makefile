.PHONY: all help install build synth deploy clean test import init upgrade watch

# Default target
all: help

# Display help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install    Install all dependencies (mise, npm)"
	@echo "  import     Import Kubernetes API schemas and CRDs for application"
	@echo "  init       Initialize the project (install + import)"
	@echo "  build      Compile the application TypeScript code"
	@echo "  watch      Run TypeScript compiler in watch mode"
	@echo "  synth      Synthesize Kubernetes manifests from application"
	@echo "  test       Run tests"
	@echo "  deploy     Apply the synthesized manifests to the current context"
	@echo "  upgrade    Upgrade application dependencies to latest"
	@echo "  clean      Remove build artifacts"

# Install tools and dependencies
install:
	@echo "Installing tools via mise..."
	mise install
	@echo "Installing application dependencies..."
	cd application && npm install

# Import k8s schemas
import:
	@echo "Importing Kubernetes schemas..."
	cd application && npm run import

# Initialize project
init: install import

# Compile TypeScript
build:
	@echo "Compiling application..."
	cd application && npm run compile

# Watch TypeScript
watch:
	@echo "Watching application..."
	cd application && npm run watch

# Synthesize manifests
synth: build
	@echo "Synthesizing manifests..."
	cd application && npm run synth

# Run tests
test:
	@echo "Running tests..."
	cd application && npm test

# Upgrade dependencies
upgrade:
	@echo "Upgrading application dependencies..."
	cd application && npm run upgrade

# Deploy to Kubernetes
deploy: synth
	@echo "Deploying to Kubernetes..."
	kubectl apply -f application/dist/

# Clean artifacts
clean:
	@echo "Cleaning up..."
	rm -rf application/dist
	rm -rf application/node_modules
	rm -f application/package-lock.json
	rm -rf application/imports
