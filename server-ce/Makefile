# Makefile

MONOREPO_ROOT := ../
export MONOREPO_REVISION := $(shell git rev-parse HEAD)
export BRANCH_NAME ?= main
export OVERLEAF_BASE_BRANCH ?= code.lcpu.dev/lcpu/sharelatex-base:$(BRANCH_NAME)
export OVERLEAF_BASE_LATEST ?= code.lcpu.dev/lcpu/sharelatex-base:latest
export OVERLEAF_BASE_TAG ?= code.lcpu.dev/lcpu/sharelatex-base:$(BRANCH_NAME)-$(MONOREPO_REVISION)
export OVERLEAF_BRANCH ?= code.lcpu.dev/lcpu/sharelatex:$(BRANCH_NAME)
export OVERLEAF_LATEST ?= code.lcpu.dev/lcpu/sharelatex:latest
export OVERLEAF_TAG ?= code.lcpu.dev/lcpu/sharelatex:$(BRANCH_NAME)-$(MONOREPO_REVISION)

all: build-base build-community

build-base:
	cp .dockerignore $(MONOREPO_ROOT)
	docker build \
	  --build-arg BUILDKIT_INLINE_CACHE=1 \
	  --progress=plain \
	  --file Dockerfile-base \
	  --pull \
	  --cache-from $(OVERLEAF_BASE_LATEST) \
	  --cache-from $(OVERLEAF_BASE_BRANCH) \
	  --tag $(OVERLEAF_BASE_TAG) \
	  --tag $(OVERLEAF_BASE_BRANCH) \
	  $(MONOREPO_ROOT)
	docker push $(OVERLEAF_BASE_TAG)
	docker push $(OVERLEAF_BASE_BRANCH)
	docker tag $(OVERLEAF_BASE_TAG) $(OVERLEAF_BASE_LATEST)
	docker push $(OVERLEAF_BASE_LATEST)

build-community:
	cp .dockerignore $(MONOREPO_ROOT)
	docker build \
	  --build-arg BUILDKIT_INLINE_CACHE=1 \
	  --progress=plain \
	  --build-arg OVERLEAF_BASE_TAG \
	  --build-arg MONOREPO_REVISION \
	  --cache-from $(OVERLEAF_LATEST) \
	  --cache-from $(OVERLEAF_BRANCH) \
	  --file Dockerfile \
	  --tag $(OVERLEAF_TAG) \
	  --tag $(OVERLEAF_BRANCH) \
	  $(MONOREPO_ROOT)
	docker push $(OVERLEAF_TAG)
	docker push $(OVERLEAF_BRANCH)
	docker tag $(OVERLEAF_TAG) $(OVERLEAF_LATEST)
	docker push $(OVERLEAF_LATEST)

.PHONY: all build-base build-community
