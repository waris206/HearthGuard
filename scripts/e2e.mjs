// End-to-end browser check: starts the built server (UI + API + MCP) on a spare port,
// drives the demo story in headless Chromium and asserts on what the UI shows.
// Usage: npm run build && npm run e2e   (screenshots land in ./e2e-screenshots)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = process.env.E2E_PORT ?? "8790";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "e2e-screenshots";
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ["server/dist/index.js"], { env: { ...process.env, PORT, HG_PERSIST: "0" }, stdio: ["ignore", "pipe", "inherit"] });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// Use Playwright's bundled browser if present, otherwise PW_CHROMIUM or the preinstalled /opt/pw-browsers/chromium.
const executablePath = process.env.PW_CHROMIUM;

await waitForServer();
let browser;
try {
  browser = await chromium.launch({ executablePath });
} catch (e) {
  if (!existsSync("/opt/pw-browsers/chromium")) throw e;
  browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
}
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

try {
  console.log("1. Load app");
  await page.goto(BASE);
  await page.getByText("MCP 2025-11-25").waitFor({ timeout: 10000 });
  assert(true, "header shows negotiated MCP protocol 2025-11-25");
  await page.getByText("Connected to Maple House").waitFor();
  assert(true, "default scenario loaded via get_home_context");
  await page.screenshot({ path: `${OUT}/01-start.png` });

  console.log("2. Investigate (compound question)");
  await page.getByPlaceholder(/Ask about the activity/).fill(
    "Investigate the repeated front-door activity while nobody was home. Does the evidence suggest a security concern, has another home seen a similar pattern, and what should I do?",
  );
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("4 MCP tool calls").waitFor({ timeout: 10000 });
  assert(true, "turn executed 4 MCP tool calls");
  const score = await page.getByTestId("risk-score").innerText();
  assert(score.startsWith("98"), `risk score shows 98 after peer match (got ${score.replace(/\n/g, "")})`);
  assert(await page.getByText("Likely security concern").first().isVisible(), "classification badge visible");
  assert((await page.getByTestId("timeline").locator("li").count()) === 12, "timeline lists 12 events");
  assert(await page.getByText("ENTRY_REPEATED_FAILED_ACCESS").first().isVisible(), "peer match shown");
  assert(await page.getByRole("button", { name: "Review & confirm" }).isVisible(), "response awaiting confirmation");
  await page.locator("li", { hasText: "HG-R4" }).filter({ hasText: "Door opened without unlock" }).first().hover();
  await page.screenshot({ path: `${OUT}/02-investigation.png` });

  console.log("3. Follow-up what-if");
  await page.getByRole("button", { name: "What if the owner was actually home?" }).click();
  await page.getByText("assuming the household was home").first().waitFor({ timeout: 10000 });
  const score2 = await page.getByTestId("risk-score").innerText();
  assert(score2.startsWith("48"), `what-if lowers score to 48 (got ${score2.replace(/\n/g, "")})`);
  assert(await page.getByText("What-if active").isVisible(), "what-if banner visible");
  await page.screenshot({ path: `${OUT}/03-whatif.png` });

  console.log("4. Revert and confirm the response");
  await page.getByRole("button", { name: "Go back to the recorded presence data." }).click();
  await page.getByText("using the recorded presence data again").waitFor({ timeout: 10000 });
  assert(await page.getByText("Observed").first().isVisible(), "evidence cards label observations");
  assert(await page.getByText("Inferred").first().isVisible(), "evidence cards label inferences");
  assert((await page.getByTestId("peer-interpretation").innerText()).includes("not proof of compromise"), "peer panel says a match is not proof");
  assert((await page.getByTestId("proportionality").innerText()).startsWith("Protective set"), "proposal explains proportionality");
  await page.getByRole("button", { name: "Review & confirm" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${OUT}/04-confirm-dialog.png` });

  console.log("4a. Backend failure must not look like success");
  await page.route("**/api/conversations/*/decision", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal error. Nothing was recorded by this request." } }) }),
  );
  await page.getByRole("button", { name: "Confirm & record" }).click();
  await page.getByText("Not recorded:").waitFor({ timeout: 5000 });
  assert(await page.getByRole("dialog").isVisible(), "dialog stays open on failure");
  assert((await page.getByText("Recorded as confirmed").count()) === 0, "no success shown when the backend failed");
  assert((await page.locator("#response").innerText()).includes("pending"), "proposal still pending after failure");
  await page.unroute("**/api/conversations/*/decision");
  await page.getByRole("button", { name: "Confirm & record" }).click();
  await page.getByText("Recorded as confirmed").waitFor({ timeout: 10000 });
  assert(true, "confirmation recorded and shown");
  const hist = await page.getByTestId("incident-history").innerText();
  assert(hist.includes("1 confirmed response"), "incident history shows confirmed response");
  await page.screenshot({ path: `${OUT}/05-confirmed.png`, fullPage: false });

  console.log("5. Home B sees Home A's indicator");
  await page.getByRole("button", { name: /Unrecognised device returns/ }).click();
  await page.getByText("Connected to Cedar Apartment").waitFor();
  await page.getByRole("button", { name: /Investigate this window/ }).click();
  await page.getByText("Cross-home check:").first().waitFor({ timeout: 10000 });
  assert(await page.getByText("Likely security concern").first().isVisible(), "Home B escalates to likely concern via peer indicator");
  await page.screenshot({ path: `${OUT}/06-home-b.png` });

  console.log("6. Normal scenario");
  await page.getByRole("button", { name: /Evening return home/ }).click();
  await page.getByText("Connected to Maple House").waitFor();
  await page.getByRole("button", { name: /Investigate this window/ }).click();
  await page.getByText("skipped the cross-home check").waitFor({ timeout: 10000 });
  assert(await page.getByText("No concern").first().isVisible(), "normal scenario -> no concern");

  console.log("7. Mobile layout");
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal overflow at 390px");
  await page.screenshot({ path: `${OUT}/07-mobile.png` });

  // The only expected console error is the deliberately failed decision request (HTTP 500).
  const unexpected = consoleErrors.filter((m) => !/status of 500/.test(m));
  assert(unexpected.length === 0, `no unexpected browser console errors (${unexpected.join(" | ")})`);
  console.log("\nE2E PASSED");
} catch (e) {
  await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
