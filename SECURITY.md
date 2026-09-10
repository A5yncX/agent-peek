# Security policy

## Reporting

Do not include transcripts, credentials, home-directory paths, or session files in a public issue.

Report a vulnerability through the repository's **Security** tab when private vulnerability reporting is available. Otherwise open a minimal issue asking the maintainer for a private contact channel, without exploit details or sensitive data.

## Scope

Security fixes target the latest release. Relevant issues include unintended transcript writes, path traversal, secret leakage, unsafe hook execution, or sending data without consent.

Agent Peek reads local agent transcripts with the current user's permissions. Review the source before installation; Pi, Claude Code, and Codex plugins can execute local code.
