import { spawn } from "node:child_process";
import { server } from "./http.mjs";
server.listen(8091, "127.0.0.1");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
function stop() {
  vite.kill();
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", stop);
