import { reportError } from "./lib/monitor";

process.on("unhandledRejection", (reason) => { void reportError("unhandledRejection", reason); });
process.on("uncaughtException", (err) => { void reportError("uncaughtException", err); });
