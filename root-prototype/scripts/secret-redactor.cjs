const rootGuidLength = 22;

function getRedactionValues(secrets) {
  const values = new Set();
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length === 0) continue;
    values.add(secret);
    if (secret.length > rootGuidLength) values.add(secret.slice(0, rootGuidLength));
  }
  return [...values].sort((left, right) => right.length - left.length);
}

function redactSecretText(text, secrets) {
  return getRedactionValues(secrets).reduce((output, value) => output.split(value).join("[REDACTED]"), text);
}

function createSecretRedactor(secrets, destination) {
  const selectedSecrets = getRedactionValues(secrets);
  let pending = "";
  let flushed = false;

  function write(chunk) {
    if (flushed) throw new Error("Cannot write to a flushed secret redactor.");
    const text = pending + chunk.toString("utf8");
    let carryLength = 0;

    for (const secret of selectedSecrets) {
      const limit = Math.min(secret.length - 1, text.length);
      for (let length = limit; length > carryLength; length -= 1) {
        if (text.endsWith(secret.slice(0, length))) {
          carryLength = length;
          break;
        }
      }
    }

    const split = text.length - carryLength;
    if (split > 0) destination.write(redactSecretText(text.slice(0, split), selectedSecrets));
    pending = text.slice(split);
  }

  function flush() {
    if (flushed) return;
    flushed = true;
    if (pending) destination.write(redactSecretText(pending, selectedSecrets));
    pending = "";
  }

  return { write, flush };
}

module.exports = { createSecretRedactor, redactSecretText };
