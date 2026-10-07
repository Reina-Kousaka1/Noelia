const credentialNames = Object.freeze({
  app: "NOELIA_ROOT_APP_DEV_TOKEN",
  bot: "NOELIA_ROOT_BOT_DEV_TOKEN",
});

function createDevhostEnvironment(surface, source = process.env) {
  const credentialName = credentialNames[surface];
  if (!credentialName) {
    throw new Error("Unknown Root runtime. Use app or bot.");
  }

  const credential = source[credentialName]?.trim();
  if (!credential) {
    throw new Error(`Missing required environment variable ${credentialName}.`);
  }

  const childEnvironment = { ...source, DEV_TOKEN: credential };
  delete childEnvironment.NOELIA_ROOT_APP_DEV_TOKEN;
  delete childEnvironment.NOELIA_ROOT_BOT_DEV_TOKEN;
  return childEnvironment;
}

module.exports = { credentialNames, createDevhostEnvironment };
