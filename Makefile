# Install every package in this repo into pi.
#
# Auto-discovers packages (any subdir with a package.json), so adding a new one
# needs no edit here.
#
#   make install   install all packages except $(SKIP) into pi (global settings)
#   make local     install all packages project-locally (.pi/settings.json)
#   make test      run each package's test script
#   make list      print discovered packages
#   make changed   print packages changed since their last version bump
#   make bump      patch-bump those packages
#   make release   test, bump, commit, publish (needs a clean tree)

PI      ?= pi
NPM     ?= npm
# These are your own packages, so trust their project-local files without a
# prompt. Override with `make install APPROVE=` to install interactively.
APPROVE ?= --approve
PKGS := $(patsubst %/package.json,%,$(wildcard */package.json))
# Packages skipped by install/local. Override: `make install SKIP=`
SKIP    ?= pets
INSTALL_PKGS := $(filter-out $(SKIP),$(PKGS))

.PHONY: install local test list changed bump release publish publish-dry

# A package is changed if anything under it landed (or is uncommitted) since the
# commit that last touched its version line in package.json.
CHANGED_SH = for p in $(PKGS); do \
		base=$$(git log -1 --format=%H -G'^[[:space:]]*"version":' -- "$$p/package.json"); \
		if [ -z "$$base" ] || [ -n "$$(git log --oneline $$base..HEAD -- $$p)" ] || [ -n "$$(git status --porcelain -- $$p)" ]; then \
			echo "$$p"; \
		fi; \
	done

install:
	@for p in $(INSTALL_PKGS); do echo "==> pi install $$p"; $(PI) install "$(CURDIR)/$$p" $(APPROVE) || exit 1; done

local:
	@for p in $(INSTALL_PKGS); do echo "==> pi install -l $$p"; $(PI) install "$(CURDIR)/$$p" -l $(APPROVE) || exit 1; done

test:
	@for p in $(PKGS); do \
		grep -q '"test"' "$$p/package.json" && { echo "==> test $$p"; ( cd "$$p" && npm test ) || exit 1; } || true; \
	done

list:
	@echo $(PKGS)

changed:
	@$(CHANGED_SH)

bump:
	@pkgs=$$($(CHANGED_SH)); \
	if [ -z "$$pkgs" ]; then echo "== nothing changed"; exit 0; fi; \
	for p in $$pkgs; do \
		( cd "$$p" && $(NPM) version patch --no-git-tag-version >/dev/null ) || exit 1; \
		echo "==> $$p $$(node -p "require('./$$p/package.json').version")"; \
	done

# Bump, commit and publish everything that changed. Wants a clean tree so the
# commit holds version bumps only.
release:
	@[ -z "$$(git status --porcelain)" ] || { echo "working tree dirty; commit first"; exit 1; }
	@pkgs=$$($(CHANGED_SH)); \
	if [ -z "$$pkgs" ]; then echo "== nothing to release"; exit 0; fi; \
	$(MAKE) test && $(MAKE) bump || exit 1; \
	git add -- $$pkgs || exit 1; \
	git commit -m "bump patch: $$(echo $$pkgs)" || exit 1; \
	$(MAKE) publish

# Publish every package to npm (unscoped, public). Run `make test` first.
# Names and versions on npm are permanent; bump the version before re-publishing.
publish:
	@for p in $(PKGS); do \
		name=$$(node -p "require('./$$p/package.json').name"); \
		ver=$$(node -p "require('./$$p/package.json').version"); \
		if $(NPM) view "$$name@$$ver" version >/dev/null 2>&1; then \
			echo "== skip $$p ($$name@$$ver already published)"; \
		else \
			echo "==> npm publish $$p ($$name@$$ver)"; ( cd "$$p" && $(NPM) publish --access public ) || exit 1; \
		fi; \
	done

publish-dry:
	@for p in $(PKGS); do echo "==> npm publish --dry-run $$p"; ( cd "$$p" && $(NPM) publish --dry-run --access public ) || exit 1; done
