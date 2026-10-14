# Architecture invariants

Rules every pull request must keep. A change that breaks one of them is a finding, and the finding
names this document.

## INV-1 — a module's `routes.ts` does not touch the database

A module's `routes.ts` is transport only: it parses the request, calls the module's service and
shapes the response. It does not import anything from `server/src/db/` (`db/schema`, `db/client`)
and does not use `container.db`. All data access goes through the module's `repository.ts`,
reached through its service.

Legacy exceptions, to be migrated and not to be copied: `workspace`, `settings`, `pulls`,
`polling`. A `routes.ts` of any other module that imports from `db/` or queries `container.db`
breaks this invariant.
