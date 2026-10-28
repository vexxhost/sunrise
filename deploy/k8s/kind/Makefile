SHELL := /bin/bash

CLUSTER_NAME ?= sunrise
KUBE_CONTEXT ?= kind-$(CLUSTER_NAME)
NAMESPACE ?= openstack
RELEASE ?= sunrise
WORKLOAD_NAME := sunrise
RELOADER_RELEASE ?= reloader
RELOADER_NAMESPACE ?= reloader-system
RELOADER_VERSION ?= 2.2.18
CERT_MANAGER_VERSION ?= v1.21.2
CERT_MANAGER_GATEWAY_API ?= false
ENVOY_GATEWAY_VERSION ?= v1.9.1
INGRESS_NGINX_RELEASE ?= ingress-nginx
INGRESS_NGINX_NAMESPACE ?= ingress-nginx
INGRESS_NGINX_VERSION ?= 4.12.1
INGRESS_NGINX_VALUES_FILE := $(abspath ingress-nginx-values.yaml)
INGRESS_PROVIDER_CONFIGMAP ?= sunrise-kind-ingress-provider
DETECTED_INGRESS_PROVIDER := $(shell kubectl --context $(KUBE_CONTEXT) -n $(NAMESPACE) \
	get configmap $(INGRESS_PROVIDER_CONFIGMAP) -o jsonpath='{.data.provider}' 2>/dev/null)
INGRESS_PROVIDER ?= $(if $(DETECTED_INGRESS_PROVIDER),$(DETECTED_INGRESS_PROVIDER),envoy-gateway)
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
LOCAL_VALUES_FILE := $(abspath values.yaml)
EXAMPLE_VALUES_FILE := $(abspath values.example.yaml)
VALUES_FILE ?= $(if $(wildcard $(LOCAL_VALUES_FILE)),$(LOCAL_VALUES_FILE),$(EXAMPLE_VALUES_FILE))
REPO_ROOT := $(abspath ../../..)
E2E_PROFILE ?= kind
E2E_PROVIDER ?= demo
E2E_BASE_URL ?= https://sunrise.localtest.me
E2E_TARGET_IMAGE ?=
E2E_AFFINITY_COOKIE ?= sunrise-affinity

ENVOY_GATEWAY_SESSION_AFFINITY_ENABLED := false
ifeq ($(INGRESS_PROVIDER),envoy-gateway)
ENVOY_GATEWAY_SESSION_AFFINITY_ENABLED := true
endif

KUBECTL := kubectl --context $(KUBE_CONTEXT)
HELM := helm --kube-context $(KUBE_CONTEXT)

.PHONY: help kind cert-manager ingress envoy-gateway envoy-gateway-down ingress-nginx \
	ingress-nginx-down wait-ingress-ports-free cluster-up cluster-down image validate-values \
	runtime-secret reloader valkey sunrise sunrise-status sunrise-test sunrise-rollout-test \
	sunrise-logs sunrise-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

kind: ## Create the kind cluster
	cat kind-config.yaml | \
		kind create cluster --name $(CLUSTER_NAME) --config /dev/stdin
	@echo "Waiting for node to be ready..."
	$(KUBECTL) wait --for=condition=Ready nodes --all --timeout=120s

cert-manager: ## Install/upgrade cert-manager and the local CA
	$(HELM) upgrade --install cert-manager cert-manager \
		--repo https://charts.jetstack.io \
		--version $(CERT_MANAGER_VERSION) \
		--namespace cert-manager --create-namespace \
		--set crds.enabled=true \
		--set config.gatewayAPI.enabled=$(CERT_MANAGER_GATEWAY_API) \
		--wait --timeout 180s
	$(KUBECTL) wait --timeout=120s -n cert-manager \
		deployment/cert-manager --for=condition=Available
	$(KUBECTL) apply -f cert-manager.yaml -n cert-manager
	$(KUBECTL) wait --timeout=120s -n cert-manager \
		certificate/localtest-root-ca --for=condition=Ready

ingress: ## Install the selected ingress provider (envoy-gateway or ingress-nginx)
	@case "$(INGRESS_PROVIDER)" in \
		envoy-gateway|ingress-nginx) $(MAKE) "$(INGRESS_PROVIDER)" ;; \
		*) echo "Unsupported INGRESS_PROVIDER: $(INGRESS_PROVIDER)" >&2; exit 2 ;; \
	esac

wait-ingress-ports-free: ## Wait until no pod reserves kind host ports 80 or 443
	./wait-ingress-ports-free.sh $(KUBE_CONTEXT) 180

envoy-gateway-down: ## Remove Envoy Gateway and release kind host ports 80 and 443
	-$(KUBECTL) -n $(NAMESPACE) delete -f sunrise-route.yaml --ignore-not-found --wait=true
	-$(KUBECTL) -n $(NAMESPACE) delete backendtrafficpolicy \
		$(WORKLOAD_NAME)-session-affinity --ignore-not-found --wait=true
	-$(KUBECTL) delete -f envoy-gateway.yaml --ignore-not-found --wait=true --timeout=180s
	@if $(HELM) status envoy-gateway -n envoy-gateway-system >/dev/null 2>&1; then \
		$(HELM) uninstall envoy-gateway -n envoy-gateway-system \
			--wait --timeout 180s; \
	fi

ingress-nginx-down: ## Remove ingress-nginx and release kind host ports 80 and 443
	-$(KUBECTL) -n $(NAMESPACE) delete -f sunrise-ingress.yaml --ignore-not-found --wait=true
	@if $(HELM) status $(INGRESS_NGINX_RELEASE) -n $(INGRESS_NGINX_NAMESPACE) >/dev/null 2>&1; then \
		$(HELM) uninstall $(INGRESS_NGINX_RELEASE) -n $(INGRESS_NGINX_NAMESPACE) \
			--wait --timeout 180s; \
	fi

envoy-gateway: ## Replace the active ingress provider with Envoy Gateway
	$(MAKE) ingress-nginx-down
	./wait-ingress-ports-free.sh $(KUBE_CONTEXT) 180 envoy-gateway-system
	$(HELM) upgrade --install envoy-gateway oci://docker.io/envoyproxy/gateway-helm \
		--version $(ENVOY_GATEWAY_VERSION) \
		--namespace envoy-gateway-system --create-namespace \
		--wait --timeout 180s
	@echo "Waiting for Envoy Gateway to be ready..."
	$(KUBECTL) wait --timeout=120s -n envoy-gateway-system \
		deployment/envoy-gateway --for=condition=Available
	$(MAKE) cert-manager CERT_MANAGER_GATEWAY_API=true
	$(KUBECTL) apply -f envoy-gateway.yaml
	$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | \
		$(KUBECTL) apply -f -
	$(KUBECTL) -n $(NAMESPACE) apply -f sunrise-route.yaml
	@echo "Waiting for Envoy Gateway to be accepted..."
	@sleep 5
	$(KUBECTL) wait --timeout=120s -n envoy-gateway-system \
		gateway/gateway --for=condition=Accepted
	$(KUBECTL) -n $(NAMESPACE) create configmap $(INGRESS_PROVIDER_CONFIGMAP) \
		--from-literal=provider=envoy-gateway --dry-run=client -o yaml | \
		$(KUBECTL) apply -f -

ingress-nginx: ## Replace the active ingress provider with Atmosphere-style ingress-nginx
	$(MAKE) envoy-gateway-down
	./wait-ingress-ports-free.sh $(KUBE_CONTEXT) 180 $(INGRESS_NGINX_NAMESPACE)
	$(MAKE) cert-manager
	$(HELM) upgrade --install $(INGRESS_NGINX_RELEASE) ingress-nginx \
		--repo https://kubernetes.github.io/ingress-nginx \
		--version $(INGRESS_NGINX_VERSION) \
		--namespace $(INGRESS_NGINX_NAMESPACE) --create-namespace \
		--values $(INGRESS_NGINX_VALUES_FILE) \
		--wait --timeout 300s
	$(KUBECTL) -n $(INGRESS_NGINX_NAMESPACE) rollout status \
		daemonset/$(INGRESS_NGINX_RELEASE)-controller --timeout=180s
	$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | \
		$(KUBECTL) apply -f -
	@for attempt in $$(seq 1 30); do \
		if $(KUBECTL) -n $(NAMESPACE) apply -f sunrise-ingress.yaml; then \
			exit 0; \
		fi; \
		echo "Waiting for the ingress-nginx admission webhook..."; \
		sleep 2; \
	done; \
	echo "ingress-nginx admission webhook did not become ready" >&2; \
	exit 1
	$(KUBECTL) -n $(NAMESPACE) wait --timeout=60s --for=create certificate/sunrise-certs
	$(KUBECTL) -n $(NAMESPACE) wait --timeout=120s \
		certificate/sunrise-certs --for=condition=Ready
	$(KUBECTL) -n $(NAMESPACE) create configmap $(INGRESS_PROVIDER_CONFIGMAP) \
		--from-literal=provider=ingress-nginx --dry-run=client -o yaml | \
		$(KUBECTL) apply -f -

cluster-up: ## Create the kind cluster and install its ingress stack
	$(MAKE) kind
	$(MAKE) ingress
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

validate-values: ## Validate that kind values match the runtime provider configuration
	./validate-kind-values.sh $(ENV_FILE) $(VALUES_FILE)

runtime-secret: validate-values ## Create/update the local runtime Secret from .env.local
	$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | \
		$(KUBECTL) apply -f -
	./create-runtime-secret.sh $(ENV_FILE) $(KUBE_CONTEXT) $(NAMESPACE) sunrise-runtime

reloader: ## Install/upgrade the kind-only configuration reload controller
	$(HELM) upgrade --install $(RELOADER_RELEASE) reloader \
		--repo https://stakater.github.io/stakater-charts \
		--version $(RELOADER_VERSION) \
		--namespace $(RELOADER_NAMESPACE) --create-namespace \
		--set reloader.reloadStrategy=annotations \
		--wait --timeout 180s

valkey: reloader runtime-secret ## Deploy the disposable kind-only Valkey service
	$(KUBECTL) -n $(NAMESPACE) apply -f valkey.yaml
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/sunrise-valkey --timeout=120s

sunrise: image valkey ## Install/upgrade Sunrise in kind
	$(HELM) upgrade --install $(RELEASE) $(CHART_DIR) \
		--namespace $(NAMESPACE) --create-namespace \
		--values $(VALUES_FILE) \
		--set-string image.repository="$(IMAGE_REPOSITORY)" \
		--set-string image.tag="$(IMAGE_TAG)" \
		--set-string image.digest="$(IMAGE_DIGEST)" \
		--set-string fullnameOverride="$(WORKLOAD_NAME)" \
		--set envoyGatewaySessionAffinity.enabled=$(ENVOY_GATEWAY_SESSION_AFFINITY_ENABLED) \
		--wait --timeout 300s
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/$(WORKLOAD_NAME) --timeout=180s

sunrise-status: ## Show Sunrise and the active ingress resources
	$(KUBECTL) -n $(NAMESPACE) get deployment,pod,service,pdb,ingress -o wide
	-$(KUBECTL) -n $(NAMESPACE) get httproute,backendtrafficpolicy -o wide

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

sunrise-rollout-test: ## Verify an authenticated session while replacing every Sunrise replica
	cd $(REPO_ROOT) && \
		SUNRISE_E2E_CLOUD_PROFILE="$(E2E_PROFILE)" \
		SUNRISE_E2E_CLOUD_BASE_URL="$(E2E_BASE_URL)" \
		SUNRISE_E2E_CLOUD_START_SERVER=0 \
		SUNRISE_E2E_CLOUD_IGNORE_HTTPS_ERRORS=1 \
		SUNRISE_E2E_CLOUD_PROVIDER="$(E2E_PROVIDER)" \
		SUNRISE_E2E_KIND_CONTEXT="$(KUBE_CONTEXT)" \
		SUNRISE_E2E_KIND_NAMESPACE="$(NAMESPACE)" \
		SUNRISE_E2E_KIND_DEPLOYMENT="$(WORKLOAD_NAME)" \
		SUNRISE_E2E_KIND_AFFINITY_COOKIE="$(E2E_AFFINITY_COOKIE)" \
		SUNRISE_E2E_KIND_IMAGE="$(E2E_TARGET_IMAGE)" \
		pnpm test:e2e:kind

sunrise-logs: ## Follow logs from every Sunrise replica
	$(KUBECTL) -n $(NAMESPACE) logs \
		-l app.kubernetes.io/name=sunrise,app.kubernetes.io/instance=$(RELEASE) \
		--all-containers --prefix --follow

sunrise-down: ## Remove Sunrise, local Valkey, and generated runtime Secret
	-$(HELM) uninstall $(RELEASE) -n $(NAMESPACE)
	-$(HELM) uninstall $(RELOADER_RELEASE) -n $(RELOADER_NAMESPACE)
	-$(KUBECTL) -n $(NAMESPACE) delete -f valkey.yaml --ignore-not-found
	-$(KUBECTL) -n $(NAMESPACE) delete -f sunrise-route.yaml --ignore-not-found
	-$(KUBECTL) -n $(NAMESPACE) delete -f sunrise-ingress.yaml --ignore-not-found
	-$(KUBECTL) -n $(NAMESPACE) delete secret sunrise-runtime --ignore-not-found

cluster-down: ## Delete the kind cluster and all data
	kind delete cluster --name $(CLUSTER_NAME)
