SHELL := /bin/bash

CLUSTER_NAME ?= sunrise
KUBE_CONTEXT ?= kind-$(CLUSTER_NAME)
NAMESPACE ?= openstack
RELEASE ?= sunrise
RELOADER_RELEASE ?= reloader
RELOADER_NAMESPACE ?= reloader-system
RELOADER_VERSION ?= 2.2.18
IMAGE_REPOSITORY ?= ghcr.io/vexxhost/sunrise
IMAGE_TAG ?= main
IMAGE_DIGEST ?=
IMAGE := $(IMAGE_REPOSITORY):$(IMAGE_TAG)
ifneq ($(strip $(IMAGE_DIGEST)),)
IMAGE := $(IMAGE_REPOSITORY)@$(IMAGE_DIGEST)
endif
PULL_IMAGE ?= true
LOAD_IMAGE ?= false
ENV_FILE ?= $(abspath ../../../.env.local)
CHART_DIR ?= $(abspath ../chart)
VALUES_FILE ?= $(abspath values.yaml)
RUNTIME_SECRET ?= sunrise-runtime

KUBECTL := kubectl --context $(KUBE_CONTEXT)
HELM := helm --kube-context $(KUBE_CONTEXT)

.PHONY: help kind envoy-gateway cluster-up cluster-down image runtime-secret \
	reloader valkey sunrise sunrise-status sunrise-test sunrise-logs sunrise-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

kind: ## Create the kind cluster
	cat kind-config.yaml | \
		kind create cluster --name $(CLUSTER_NAME) --config /dev/stdin
	@echo "Waiting for node to be ready..."
	$(KUBECTL) wait --for=condition=Ready nodes --all --timeout=120s

envoy-gateway: ## Install/upgrade Envoy Gateway and cert-manager
	$(HELM) upgrade --install envoy-gateway oci://docker.io/envoyproxy/gateway-helm \
		--version v1.9.1 \
		--namespace envoy-gateway-system --create-namespace \
		--wait --timeout 180s
	@echo "Waiting for Envoy Gateway to be ready..."
	$(KUBECTL) wait --timeout=120s -n envoy-gateway-system \
		deployment/envoy-gateway --for=condition=Available
	$(HELM) upgrade --install cert-manager cert-manager \
		--repo https://charts.jetstack.io \
		--version v1.21.2 \
		--namespace cert-manager --create-namespace \
		--set crds.enabled=true \
		--set config.gatewayAPI.enabled=true \
		--wait --timeout 180s
	@echo "Waiting for cert-manager to be ready..."
	$(KUBECTL) wait --timeout=120s -n cert-manager \
		deployment/cert-manager --for=condition=Available
	$(KUBECTL) apply -f cert-manager.yaml -n cert-manager
	$(KUBECTL) apply -f envoy-gateway.yaml
	@echo "Waiting for Envoy Gateway to be accepted..."
	@sleep 5
	$(KUBECTL) wait --timeout=120s -n envoy-gateway-system \
		gateway/gateway --for=condition=Accepted

cluster-up: ## Create the kind cluster and install its ingress stack
	$(MAKE) kind
	$(MAKE) envoy-gateway
	@echo ""
	@echo "Cluster '$(CLUSTER_NAME)' is ready."
	@echo "Context: $(KUBE_CONTEXT)"

image: ## Prepare Sunrise image metadata; optionally pull and load it into kind
	@if [[ "$(PULL_IMAGE)" == "true" ]]; then \
		docker pull $(IMAGE); \
	fi
	@docker image inspect $(IMAGE) >/dev/null
	@if [[ "$(LOAD_IMAGE)" == "true" ]]; then \
		kind load docker-image --name $(CLUSTER_NAME) $(IMAGE); \
	fi

runtime-secret: ## Create/update the local runtime Secret from .env.local
	./create-runtime-secret.sh $(ENV_FILE) $(KUBE_CONTEXT) $(NAMESPACE) $(RUNTIME_SECRET)

reloader: ## Install/upgrade the kind-only configuration reload controller
	$(HELM) upgrade --install $(RELOADER_RELEASE) reloader \
		--repo https://stakater.github.io/stakater-charts \
		--version $(RELOADER_VERSION) \
		--namespace $(RELOADER_NAMESPACE) --create-namespace \
		--set reloader.reloadStrategy=annotations \
		--wait --timeout 180s

valkey: runtime-secret ## Deploy the disposable kind-only Valkey service
	$(KUBECTL) apply -f valkey.yaml
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/sunrise-valkey --timeout=120s

sunrise: image runtime-secret valkey reloader ## Install/upgrade Sunrise in kind
	$(HELM) upgrade --install $(RELEASE) $(CHART_DIR) \
		--namespace $(NAMESPACE) --create-namespace \
		--values $(VALUES_FILE) \
		--set-string image.repository="$(IMAGE_REPOSITORY)" \
		--set-string image.tag="$(IMAGE_TAG)" \
		--set-string image.digest="$(IMAGE_DIGEST)" \
		--wait --timeout 300s
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/$(RELEASE) --timeout=180s

sunrise-status: ## Show Sunrise, Valkey, Service, and HTTPRoute status
	$(KUBECTL) -n $(NAMESPACE) get deployment,pod,service,pdb,httproute -o wide

sunrise-test: ## Run the Helm test and HTTPS health checks
	$(HELM) test $(RELEASE) -n $(NAMESPACE) --logs
	@ca_file="$$(mktemp)"; \
	trap 'rm -f "$$ca_file"' EXIT; \
	$(KUBECTL) -n cert-manager get secret localtest-root-ca \
		-o jsonpath='{.data.tls\.crt}' | openssl base64 -d -A > "$$ca_file"; \
	curl --fail --silent --show-error --cacert "$$ca_file" \
		https://sunrise.localtest.me/healthz; \
	echo; \
	curl --fail --silent --show-error --cacert "$$ca_file" \
		https://sunrise.localtest.me/readyz; \
	echo

sunrise-logs: ## Follow logs from every Sunrise replica
	$(KUBECTL) -n $(NAMESPACE) logs \
		-l app.kubernetes.io/name=sunrise,app.kubernetes.io/instance=$(RELEASE) \
		--all-containers --prefix --follow

sunrise-down: ## Remove Sunrise, local Valkey, and generated runtime Secret
	-$(HELM) uninstall $(RELEASE) -n $(NAMESPACE)
	-$(HELM) uninstall $(RELOADER_RELEASE) -n $(RELOADER_NAMESPACE)
	-$(KUBECTL) delete -f valkey.yaml --ignore-not-found
	-$(KUBECTL) -n $(NAMESPACE) delete secret $(RUNTIME_SECRET) --ignore-not-found

cluster-down: ## Delete the kind cluster and all data
	kind delete cluster --name $(CLUSTER_NAME)
