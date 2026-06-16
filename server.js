const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const appDir = __dirname;
const standaloneServer = join(appDir, ".next", "standalone", "server.js");
const buildIdPath = join(appDir, ".next", "BUILD_ID");
const port = process.env.PORT || "3000";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!existsSync(join(appDir, "node_modules"))) {
  run("npm", ["install"]);
}

if (!existsSync(buildIdPath)) {
  run("npm", ["run", "build"]);
}

if (existsSync(standaloneServer)) {
  run("node", [standaloneServer]);
} else {
  run("npm", ["run", "start", "--", "-H", "0.0.0.0", "-p", port]);
}
