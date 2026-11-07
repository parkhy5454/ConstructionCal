// tests/*.test.ts 를 esbuild로 번들해 node로 실행하고 결과를 모읍니다. (tsx는 exceljs를 못 읽어서 번들 방식 사용)
// 사용: npm test  /  npm test -- session   (파일명 일부로 필터)
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const dir = join(root, "tests");
const filter = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts") && (!filter || f.includes(filter)));
const out = mkdtempSync(join(tmpdir(), "concal-tests-"));
let failed = 0;

for (const f of files) {
  const outfile = join(out, f.replace(/\.ts$/, ".cjs"));
  await build({
    entryPoints: [join(dir, f)], bundle: true, platform: "node", outfile, logLevel: "error",
    external: ["@electric-sql/pglite"], // pglite는 자체 wasm 파일을 읽으므로 번들하지 않음
  });
  const r = spawnSync("node", [outfile], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_PATH: join(root, "node_modules") } });
  const text = (r.stdout ?? "") + (r.stderr ?? "");
  const bad = text.split("\n").filter((l) => l.startsWith("XX ") || l.includes("❌")).length;
  const oks = text.split("\n").filter((l) => l.startsWith("OK ") || l.includes("✅")).length;
  const pass = r.status === 0 && bad === 0;
  console.log(`${pass ? "PASS" : "FAIL"}  ${f}  (${oks} ok${bad ? `, ${bad} 실패` : ""})`);
  if (!pass) { failed++; console.log(text.split("\n").filter((l) => !l.startsWith("OK ")).slice(-25).join("\n")); }
}
rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed}개 파일 실패` : `\n전체 통과 (${files.length}개 파일)`);
process.exit(failed ? 1 : 0);
