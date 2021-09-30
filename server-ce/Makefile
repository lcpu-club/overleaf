# Makefile

short_commit :=$(shell git rev-parse --short HEAD)
pipeline_id := ${GITHUB_RUN_ID}
tag := ${short_commit}-${pipeline_id}
aliyun_tag ?= registry.cn-shenzhen.aliyuncs.com/byrio/overleaf:${tag}

SHARELATEX_BASE_TAG ?= sharelatex/sharelatex-base
SHARELATEX_TAG ?= sharelatex/sharelatex
SHARELATEX_BASE_CACHE := $(shell echo $(SHARELATEX_BASE_TAG) | sed -E 's/(.+):.+/\1:latest/')
MONOREPO_REVISION := $(shell git rev-parse HEAD)
MONOREPO_ROOT := ../

build-base:
	echo "build base ${aliyun_tag}"
	cp .dockerignore $(MONOREPO_ROOT)
	docker pull $(SHARELATEX_BASE_CACHE) || echo "nothing cached yet"
	docker build -f Dockerfile-base --pull \
		--cache-from $(SHARELATEX_BASE_CACHE) \
		-t $(SHARELATEX_BASE_TAG) \
		-t $(aliyun_tag) \
		$(MONOREPO_ROOT)


build-community:
	cp .dockerignore $(MONOREPO_ROOT)
	docker build --build-arg SHARELATEX_BASE_TAG --build-arg MONOREPO_REVISION -f Dockerfile -t $(SHARELATEX_TAG) $(MONOREPO_ROOT)

publish-base:
	docker push $(aliyun_tag)

PHONY: build-base build-community
