// Production compilation against a fresh loopback database; never production credentials.
import { spawn } from "node:child_process";
import path from "node:path";
import { root } from "../../admin-a/support/bundle.mjs";
import { database } from "./database.mjs";

const handle = await database();
try {
  const env = { ...process.env, DATABASE_URL: handle.url, DIRECT_URL: handle.url };
  for (const [entry, args] of [["prisma/build/index.js", ["generate"]], ["next/dist/bin/next", ["build"]]]) {
    const child = spawn(process.execPath, [path.join(root, "node_modules", entry), ...args], { cwd: root, env, stdio: "inherit", windowsHide: true });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    if (code !== 0) throw new Error(`Build step ${entry} failed: ${code}`);
  }
} finally { await handle.close(); }
