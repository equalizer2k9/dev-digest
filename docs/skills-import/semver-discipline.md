# semver-discipline

ALWAYS flag when a diff changes a public contract without the matching version bump. Do not pass a diff that ships a breaking change under an unchanged or patch-level version.

## Rule

The version in `package.json` (and any API version constant or path prefix) is
a promise to consumers. The size of the bump must match the size of the change:

| Change in the diff | Required bump |
|---|---|
| field/route removed, renamed, retyped; new required input | MAJOR |
| new optional field, new route, new enum value | MINOR |
| bug fix with identical wire shape | PATCH |

## How to check

1. Classify the contract change in the diff using the table above.
2. Look for a `version` change in the `package.json` of the package that owns
   the contract. No `package.json` in the diff means NO bump was made.
3. Compare: a breaking change with no bump, or with a minor/patch bump, is a
   finding. So is a vendored contract copy changed without any version marker.
4. A commit or PR title of type `refactor`, `chore` or `tidy` on a diff that
   changes the wire shape is mislabelled — say so.

## Severity

CRITICAL when a breaking change ships with no MAJOR bump: consumers pinning
`^x.y` receive it as a safe update. WARNING when an additive change has no
MINOR bump.

## Good / Bad

```diff
 // Bad — wire shape broken, version untouched
-  additions: z.number().int(),
+  added_lines: z.number().int(),
 // package.json: "version": "0.1.0"  (unchanged)

 // Good — same change, declared as breaking
-  "version": "1.4.2",
+  "version": "2.0.0",
```

## Report

Cite the contract line that changed. State the classification (MAJOR / MINOR),
the version found, and the version required.
