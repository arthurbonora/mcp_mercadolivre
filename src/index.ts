#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMeliServer } from "./server-factory.js";
await createMeliServer().connect(new StdioServerTransport());
