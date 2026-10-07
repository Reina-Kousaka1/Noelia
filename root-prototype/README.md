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

Each Root development credential is associated with a Root community. Use App and Bot credentials for the same community to have their interactions meet. The Bot answers only the `!noelia help` message in a channel. The App server relays that Bot-authored message through its generated Root client/server broadcast service, and the existing Madame UI presents it as an explanation. Root does not provide a direct Bot-to-App RPC; the shared Root community event and the App's supported broadcast mechanism form this bridge.

## Scope and safety

This is an opt-in development preview, not a production ownership transfer. The Root App and Bot do not share a Root server process or a Root-managed persistent store. This help path is presentation-only and does not write gameplay state. The App remains the Root UI runtime; the Bot remains a channel-message adapter. No Discord/Eris authentication is used here.

The Root App client receives no credentials. Its event handler updates the existing Madame presentation only. The Bot ignores system messages, messages from other communities, and anything except the narrow help trigger; its response does not match that trigger, preventing a self-reply loop.
