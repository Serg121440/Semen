const { cpSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const appDir = __dirname;
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

const standaloneServer = join(appDir, ".next", "standalone", "server.js");

function startStandalone() {
  // A standalone build ships its own server, and `next start` refuses to serve
  // that layout. The generated server expects static assets beside it, so copy
  // them over first; if anything is missing we fall back to `next start`,
  // which still works (it only warns).
  const staticSrc = join(appDir, ".next", "static");
  const staticDest = join(appDir, ".next", "standalone", ".next", "static");

  if (!existsSync(staticSrc)) {
    return false;
  }

  try {
    if (!existsSync(staticDest)) {
      cpSync(staticSrc, staticDest, { recursive: true });
    }

    const publicSrc = join(appDir, "public");
    const publicDest = join(appDir, ".next", "standalone", "public");
    if (existsSync(publicSrc) && !existsSync(publicDest)) {
      cpSync(publicSrc, publicDest, { recursive: true });
    }
  } catch (error) {
    console.warn("standalone asset copy failed, falling back to next start:", error);
    return false;
  }

  process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
  process.env.PORT = port;
  run("node", [standaloneServer]);
  return true;
}

if (!existsSync(standaloneServer) || !startStandalone()) {
  run("npm", ["run", "start", "--", "-H", "0.0.0.0", "-p", port]);
}
