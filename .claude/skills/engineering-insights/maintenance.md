# Review mode — `/engineering-insights review <module>`

The only mode that may delete or rewrite entries. Nothing changes without user confirmation.

1. Read `<module>/INSIGHTS.md` and `<module>/CLAUDE.md` (for the root file: root `INSIGHTS.md`
   and root `CLAUDE.md`).
2. Check every entry and sort it into the proposal table:

   | Action | When | Verify by |
   |---|---|---|
   | Delete — obsolete | Evidence path or symbol no longer exists, or the quirk is fixed in the current dependency version | `ls` / `grep` the Evidence; check `package.json` version |
   | Merge | Two entries state the same rule | Keep the clearer one; carry over `Seen again` dates |
   | Resolve conflict | Two entries contradict | Re-check against current code; keep the true one |
   | Promote | Has `Seen again`, or applies to most tasks in the module | Draft the single `CLAUDE.md` Gotchas line; check the ≤100-line budget |
   | Close question | An Open Question is now answerable from the code | Write the answer + an entry in the proper section |
   | Keep | Everything else | — |

3. Show the table to the user: entry date + first words · action · reason. Apply only the rows
   the user approves.
4. Append to Session Notes:

   ```markdown
   ### YYYY-MM-DD — insights review
   - Done: deleted N, merged N, promoted N, closed N questions
   ```
