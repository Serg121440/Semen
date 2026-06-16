const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = __dirname;
const frontendDir = join(rootDir, "frontend");
const buildIdPath = join(frontendDir, ".next", "BUILD_ID");
const port = process.env.PORT || "3000";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!existsSync(join(frontendDir, "node_modules"))) {
  run("npm", ["--prefix", "frontend", "install"]);
}

if (!existsSync(buildIdPath)) {
  run("npm", ["--prefix", "frontend", "run", "build"]);
}

run("npm", ["--prefix", "frontend", "run", "start", "--", "-H", "0.0.0.0", "-p", port]);
