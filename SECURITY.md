# Security policy

Please do not open a public issue or pull request containing a vulnerability,
Discord bot token, webhook URL, database credential, `.env` contents, or
personal data.

No private security contact is documented in this repository. If GitHub's
private vulnerability reporting is enabled for Noélia, use the **Report a
vulnerability** option on the repository's Security tab. If it is not
available, do not publish sensitive details in an issue; contact the repository
maintainer through a private channel already known to you.

If a Discord token or other credential may have been exposed, revoke or rotate
it immediately, then remove it from the affected secret store and review
relevant access logs. Treat leaked webhook URLs and database credentials as
compromised too.

When reporting privately, include the affected version or commit, impact,
reproduction details, and any mitigations you have identified. Avoid sending
real user data unless it is essential and can be shared safely.
