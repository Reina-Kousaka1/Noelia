const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const test = require("node:test");
const { createSecretRedactor } = require("./secret-redactor.cjs");

test("secret redaction covers values split across output chunks", () => {
  const secret = "private-runtime-token-sentinel";

  for (let split = 0; split <= secret.length; split += 1) {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString("utf8");
        callback();
      },
    });
    const redactor = createSecretRedactor([secret], destination);

    redactor.write(Buffer.from(`before:${secret.slice(0, split)}`));
    redactor.write(Buffer.from(`${secret.slice(split)}:after`));
    redactor.flush();

    assert.equal(output, "before:[REDACTED]:after");
    assert.equal(output.includes(secret), false);
  }
});

test("secret redaction covers a Root GUID prefix emitted from a token", () => {
  const token = "abcdefghijklmnopqrstuv0123456789-this-is-a-test-token";
  let output = "";
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString("utf8");
      callback();
    },
  });
  const redactor = createSecretRedactor([token], destination);

  redactor.write(Buffer.from("Community: Attached abcdefghijk"));
  redactor.write(Buffer.from("lmnopqrstuv"));
  redactor.flush();

  assert.equal(output, "Community: Attached [REDACTED]");
  assert.equal(output.includes(token.slice(0, 22)), false);
});

test("secret redaction ignores empty values and flushes once", () => {
  let output = "";
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString("utf8");
      callback();
    },
  });
  const redactor = createSecretRedactor(["", undefined], destination);

  redactor.write(Buffer.from("ordinary output"));
  redactor.flush();
  redactor.flush();

  assert.equal(output, "ordinary output");
});
