# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`harus-charts` is a Kubernetes infrastructure repository that manages Kubernetes resources using three approaches:

1. **CDK8s** (TypeScript-based): Located in `application/` (formerly in `cdk8s/`)
2. **Helm Charts**: Located in `helm/` (e.g., `postgres-ha`)
3. **Raw Manifests**: Static YAML files in `kubernetes/manifests/`
4. **ArgoCD**: GitOps deployment configurations in `argocd/`

## Tool Management

This project uses `mise` for tool version management. Required tools are defined in `mise.toml`:

- Node.js (LTS)
- Bun (latest)
- kubectl (latest)
- Helm (latest)
- cdk8s-cli (latest)

Install tools: `mise install`

## Common Commands

All commands use the root-level `Makefile`:

```bash
# Setup
make install    # Install mise tools + npm dependencies
make init       # Full initialization (install + import schemas)
make import     # Import Kubernetes API schemas and CRDs

# Development
make build      # Compile TypeScript in application/
make watch      # Run TypeScript compiler in watch mode
make synth      # Synthesize Kubernetes manifests to application/dist/
make test       # Run Jest tests

# Deployment
make deploy     # Apply synthesized manifests with kubectl
make upgrade    # Upgrade cdk8s dependencies
make clean      # Remove build artifacts and node_modules
```

## Architecture

### CDK8s Structure (application/)

- **Entry point**: `main.ts` - Creates CDK8s App and instantiates charts
- **Charts**: Located in `src/` directory
  - `src/etcd.ts`: `EtcdClusterChart` - Defines StatefulSet-based etcd cluster with headless and client services
- **Generated files**: `dist/` contains synthesized YAML manifests
- **Imports**: `imports/` contains auto-generated Kubernetes API types (gitignored)

The CDK8s approach uses TypeScript constructs to define Kubernetes resources programmatically. Charts extend `Chart` from `cdk8s` and use imported Kubernetes resource types (e.g., `KubeStatefulSet`, `KubeService`).

### ArgoCD Integration

- `argocd/cluster.yaml`: Defines cluster connection secrets for ArgoCD
- `argocd/application.yaml`: ArgoCD Application pointing to `kubernetes/manifests/`
- Repository URL: https://github.com/azusachino/harus-charts
- Target cluster: `okj-exchange-test`

### Directory Layout

```
application/        # CDK8s TypeScript project
├── src/               # Chart definitions
├── dist/              # Synthesized YAML output
├── main.ts            # CDK8s app entry point
├── main.test.ts       # Jest tests
└── package.json       # npm scripts and dependencies

argocd/                # ArgoCD configurations
├── application.yaml   # ArgoCD Application manifests
└── cluster.yaml       # Cluster connection secrets

kubernetes/manifests/  # Raw Kubernetes YAML files
├── nginx-deployment.yaml
├── nginx-service.yaml
└── etcd-cluster.yaml

helm/                  # Helm charts
└── postgres-ha/       # PostgreSQL HA chart
```

## Development Workflow

1. **CDK8s Development**:
   - Edit TypeScript charts in `application/src/`
   - Instantiate charts in `application/main.ts`
   - Run `make build` to compile
   - Run `make test` to verify
   - Run `make synth` to generate YAML in `application/dist/`

2. **Adding Kubernetes Resources**:
   - Import new CRDs: `make import` or `cd application && npm run import`
   - Use imported types from `imports/k8s` module

3. **Deployment**:
   - ArgoCD automatically syncs from `kubernetes/manifests/`
   - Manual deployment: `make deploy` applies synthesized CDK8s manifests

## Task Management

The project references a CLI ticket system `tk`. Run `tk help` for task tracking capabilities if needed.

## Recent Changes

Based on git history:

- Removed nginx ingress controller
- Added and then removed etcd cluster from ArgoCD sync
- Modified etcd configuration (removed CSI)
- Transitioned from `cdk8s/` to `application/` directory structure
