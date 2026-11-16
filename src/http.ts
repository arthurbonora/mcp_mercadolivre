#!/usr/bin/env node
import { createVerifier, readHttpConfig } from "./http-auth.js";
import { createHttpService } from "./http-service.js";
if (process.env.ML_READ_ONLY !== undefined && !["true", "1"].includes(process.env.ML_READ_ONLY)) throw new Error("HTTP deployment is read-only");
process.env.ML_READ_ONLY = "true";
const config = readHttpConfig(process.env);
const { createMeliServer } = await import("./server-factory.js");
createHttpService(config, createVerifier(config), createMeliServer).listen(config.port, "127.0.0.1");
