#!/usr/bin/env node

import { bootstrapApp } from "./app/bootstrap.js";

const app = await bootstrapApp();
await app.start();
