const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { createServer } = require("node:http");

const port = Number(process.env.PORT || 3000);

if (existsSync("main.py")) {
  const python = process.env.PYTHON_BIN || "python";
  const child = spawn(python, ["main.py"], {
    env: process.env,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("server.js is present, but main.py was not found.");
  }).listen(port, "0.0.0.0", () => {
    console.log(`Fallback server listening on ${port}`);
  });
}
