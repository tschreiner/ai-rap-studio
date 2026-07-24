# Security Policy

## Sensitive data

Do not include provider credentials, source stories, personal facts, generated private lyrics, environment files, or raw model logs in commits, issues, or pull requests.

Prefer `--source-file` over `--source-text`. File mode copies the source into an isolated temporary directory, grants only that directory to sandboxed `agy`, and removes it after idea generation. The temporary path and source metadata are process-visible; the original path and source content are not placed in the prompt argument. Inline source text is serialized into the prompt argument and is not suitable for sensitive material. Generated artifacts remain under the ignored `outputs/` directory but can still contain sensitive derived content.

## Prompt injection

Source material is serialized as JSON and treated as data. Report any path that allows source content to:

- escape a prompt data boundary;
- alter the required model;
- skip schema validation;
- expose system prompts or other private material;
- execute tools or edits during lyric generation.

## Reporting

Report vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting feature when available. Do not include real secrets or personal source material in the report; use a minimal synthetic reproduction.
