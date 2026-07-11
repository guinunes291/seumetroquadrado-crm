#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";

const secret = `smq_live_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(secret, "utf8").digest("hex");

// O segredo aparece uma unica vez. Persista apenas segredo_hash no banco.
process.stdout.write(
  `${JSON.stringify(
    {
      secret,
      segredo_hash: hash,
      segredo_prefixo: hash.slice(-8),
    },
    null,
    2,
  )}\n`,
);
