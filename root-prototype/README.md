# Noélia Root prototype

This prototype contains a Root App and a separate Root Community Bot for the same Noélia experience. They are separate Root identities and server runtimes. The App owns the UI and client broadcasts; the Bot receives channel messages and posts replies. Both use the existing `@noelia-root/persona` package, so the help response does not introduce a second Madame personality.

## Authentication and local setup

Root DevHost expects a `DEV_TOKEN`. The launch scripts require separate local secret variables and pass only the selected one to each runtime:

- `NOELIA_ROOT_APP_DEV_TOKEN` for `npm run start:app`
- `NOELIA_ROOT_BOT_DEV_TOKEN` for `npm run start:bot`

Set these in a local secret manager or the terminal process environment. Do not put them in source files, `VITE_*` variables, or committed configuration. The launch wrapper does not print either value and removes both named variables from the child process before setting its single `DEV_TOKEN`.

For the App to relay Bot messages into the active App client, also configure `NOELIA_ROOT_BOT_USER_ID` with the Bot message author's Root user ID. This is an identifier, not a credential. The relay accepts messages only when both this identity and the App server's current community ID match.

The `id` values in `root-manifest.json` and `community-bot/root-manifest.json` are placeholders. Replace them with the App and Bot IDs assigned by the Root Developer Portal before attempting a live DevHost session. Create/rotate the App and Bot development credentials in Root; do not reuse previously exposed tokens.

Install the workspace dependencies and build:

```sh
npm install
npm run build
npm test
```

Run the App and Bot in separate terminals after setting their respective credentials:

```sh
npm run start:app
npm run start:bot
```

Each Root development credential is associated with a Root community. Use App and Bot credentials for the same community to have their interactions meet. The Bot accepts a small set of explicit, stateless commands: `!noelia help`, `status`, `hello`, `chat`, `ballet [prepare|success|miss|again|encourage|warning|correct|confused|recover|stamina|ready]`, `style`, and `luxury`. Other messages are ignored. Unknown and malformed commands receive a short Madame response, and the Bot only replies to user messages in its configured community.

The App server relays Bot-authored messages through its generated Root client/server broadcast service. The event preserves the original message and mood fields and adds typed context and signal enums; the client validates the message before updating Madame's existing presentation. Root does not provide a direct Bot-to-App RPC, so the community channel and the App's supported broadcast mechanism form this bridge.

## Scope and safety

This is an opt-in development preview, not a production ownership transfer. The Root App and Bot do not share a Root server process or a Root-managed persistent store. These community interactions are presentation-only and do not write gameplay state. The App remains the Root UI runtime; the Bot remains a channel-message adapter. No Discord/Eris authentication is used here.

The Root App client receives no credentials. Its event handler updates the existing Madame presentation only. The App and Bot remain separate runtimes and do not share a persistent store. Root Economy V2 is not implemented: bank and cash balances, earnings, deposits and withdrawals, purchase funding, transfers and progressive tax, treasury accounting, admin insight, and an atomic idempotent ledger remain a later phase. The next Root foundation should establish a shared persistent store and ledger rules before any economy commands are exposed.
