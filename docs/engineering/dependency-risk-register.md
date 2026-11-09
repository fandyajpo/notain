# Dependency Risk Register

## DR-001: deepmerge Prototype Poisoning Advisory

Status: Temporarily Accepted
Severity: Low (npm audit classification)
Package: deepmerge@4.3.1
Advisory: GHSA-gcqx-w48m-w2h4

### Dependency Path

@astrojs/svelte@9.1.2
└── @sveltejs/vite-plugin-svelte@7.3.1
└── deepmerge@4.3.1

### Usage

Used by mergeConfigs() in
@sveltejs/vite-plugin-svelte/src/utils/options.js.

The function merges Vite and Svelte plugin configuration
during plugin option resolution.

### Risk Assessment

Current evidence indicates configuration-time usage,
not direct exposure through application HTTP requests.

External exploitability has not been established.

### Mitigation

- Do not use npm audit fix --force.
- Do not downgrade Astro or Svelte integration.
- Do not introduce unverified dependency overrides.
- Monitor upstream advisory and plugin releases.
- Reassess when a verified upstream fix becomes available.

### Review Trigger

Reassess when:

- deepmerge publishes a verified fix.
- Svelte Vite plugin updates its dependency.
- GitHub Advisory changes its status.
- New exploitability evidence becomes available.
