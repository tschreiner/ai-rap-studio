# Contributing

AI Rap Studio is local-first and currently unlicensed. Discuss redistribution rights with the repository owner before reusing code outside this repository.

## Development workflow

1. Create a branch or separate worktree.
2. Read `AGENTS.md`.
3. Keep existing prompt and script versions immutable.
4. Add a new version for contract changes.
5. Use only synthetic fixtures in tests and issues.
6. Run:

   ```powershell
   npm test
   npm run validate
   .\scripts\validate-plugin-v2.ps1
   git diff --check
   ```

7. Explain contract changes, migration impact, and evidence in the pull request.

Live `agy` inference is opt-in and must not be added to CI. Never commit `outputs/`, provider logs, private source files, credentials, or complete generated songs derived from private people.

## Prompt changes

Add prompt files with a new versioned name. Update the matching integrity manifest and add focused contract tests. Do not edit an already released prompt in place.
