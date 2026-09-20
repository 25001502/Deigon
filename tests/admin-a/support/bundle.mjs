import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function bundle(contents, boundaries = {}) {
  const result = await build({
    stdin: { contents, resolveDir: root, sourcefile: "admin-a-test.tsx", loader: "tsx" },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
    plugins: [{ name: "admin-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: importPath }) => {
        if (Object.hasOwn(boundaries, importPath)) return { path: importPath, namespace: "admin-test" };
      });
      builder.onLoad({ filter: /.*/, namespace: "admin-test" }, ({ path: importPath }) => ({
        contents: boundaries[importPath], loader: "tsx", resolveDir: root,
      }));
    } }],
  });
  const loaded = new Module(path.join(root, "admin-a-test.cjs"));
  loaded.filename = path.join(root, "admin-a-test.cjs");
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(result.outputFiles[0].text, loaded.filename);
  return loaded.exports;
}

export function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
