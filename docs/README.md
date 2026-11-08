# Documentation

Use [`BUSINESS_FLOWS.md`](./BUSINESS_FLOWS.md) as the current, source-checked guide to what users and administrators can do in the app. It distinguishes implemented behavior from disabled or placeholder features and includes candidate good-path and bad-path test scenes. These scenes are proposals, not tests already executed.

## Current references

- [`ORG_LIFECYCLE.md`](./ORG_LIFECYCLE.md) — no-organization state, organization creation/deletion, and the current identity split.
- [`quota.md`](./quota.md) — service limits, safeguards, and quota failure behavior.
- [`TEST_SCENARIOS.md`](./TEST_SCENARIOS.md) — audit/security and infrastructure scenarios. Some old assumptions in this file have been corrected; use the business-flow guide for full functional coverage.

## Historical or partially superseded references

- [`multi-tenancy.md`](./multi-tenancy.md) — contains older onboarding, profile, and invitation descriptions. Read its status notice before using it.
- [`payments.md`](./payments.md) — contains old profile-based billing and Business checkout instructions. Read its status notice; do not use its old operational steps as current setup guidance.
- [`business-site.md`](./business-site.md) — older owner-ID route and payload descriptions. Current public site URLs use an organization ID; read its status notice.
- [`CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md) — audit findings and context, not a user-flow specification.

## Source of truth and safety

Documentation follows the executable source in this repository. If a source comment, old document, or UI label disagrees with the current endpoint behavior, the endpoint and its tests take precedence. No runtime, test-suite, production-data, real-payment, webhook-delivery, or organization-deletion verification was performed while writing these guides. Run candidate scenarios only with isolated test accounts/data and a non-production environment; payment scenarios must use DOKU sandbox credentials.
