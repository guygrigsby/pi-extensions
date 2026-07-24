# Install every package in this repo into pi.
#
# Auto-discovers packages (any subdir with a package.json), so adding a new one
# needs no edit here.
#
#   make install   install all packages except $(SKIP) into pi (global settings)
#   make local     install all packages project-locally (.pi/settings.json)
#   make test      run each package's test script
#   make list      print discovered packages

PI      ?= pi
NPM     ?= npm
# These are your own packages, so trust their project-local files without a
# prompt. Override with `make install APPROVE=` to install interactively.
APPROVE ?= --approve
PKGS := $(patsubst %/package.json,%,$(wildcard */package.json))
# Packages skipped by install/local. Override: `make install SKIP=`
SKIP    ?= pets
INSTALL_PKGS := $(filter-out $(SKIP),$(PKGS))

.PHONY: install local test list publish publish-dry

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

# Publish every package to npm (unscoped, public). Run `make test` first.
# Names and versions on npm are permanent; bump the version before re-publishing.
publish:
	@for p in $(PKGS); do echo "==> npm publish $$p"; ( cd "$$p" && $(NPM) publish --access public ) || exit 1; done

publish-dry:
	@for p in $(PKGS); do echo "==> npm publish --dry-run $$p"; ( cd "$$p" && $(NPM) publish --dry-run --access public ) || exit 1; done
