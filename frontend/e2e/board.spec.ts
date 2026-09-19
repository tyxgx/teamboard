import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Seed = {
  alice: { token: string; name: string };
  mo: { token: string; name: string };
  code: string;
  boardId: string;
  boardName: string;
};
const seed: Seed = JSON.parse(fs.readFileSync(path.join(__dirname, ".seed.json"), "utf8"));

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function openBoard(browser: Browser, who: "alice" | "mo"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await ctx.addInitScript((t) => localStorage.setItem("token", t), seed[who].token);
  const page = await ctx.newPage();
  await page.goto(`/board/${seed.code}`);
  await expect(page.getByRole("heading", { name: seed.boardName })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("Type a message")).toBeEnabled();
  return { ctx, page };
}

const send = async (page: Page, text: string) => {
  await page.getByPlaceholder("Type a message").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
};
const messageBubble = (page: Page, text: string) =>
  page.locator("[data-visibility]").filter({ hasText: text }).first();
const uniq = (label: string) => `${label} ${Date.now().toString(36)}`;

test.describe("TeamBoard, two people in one board", () => {
  let alice: Page;
  let mo: Page;
  let ctxs: BrowserContext[] = [];

  test.beforeEach(async ({ browser }) => {
    const a = await openBoard(browser, "alice");
    const m = await openBoard(browser, "mo");
    alice = a.page;
    mo = m.page;
    ctxs = [a.ctx, m.ctx];
  });
  test.afterEach(async () => {
    await Promise.all(ctxs.map((c) => c.close()));
  });

  test("a message sent by one person appears live for the other", async () => {
    const text = uniq("hello live");
    await send(alice, text);
    await expect(messageBubble(alice, text)).toBeVisible();
    await expect(messageBubble(mo, text)).toBeVisible();
  });

  test("anonymous messages never show the real name to a member", async () => {
    const text = uniq("anon note");
    await alice.getByRole("button", { name: /Enable anonymous/ }).click();
    await send(alice, text);
    const bubble = messageBubble(mo, text);
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("Anonymous");
    await expect(bubble).not.toContainText("Alice Admin"); // the board may hold other, non-anonymous messages from Alice
  });

  test("reactions toggle and update for both people", async () => {
    const text = uniq("react to me");
    await send(alice, text);
    const b = messageBubble(mo, text);
    await b.hover();
    await b.getByRole("button", { name: "React 👍" }).click();
    await expect(b.getByRole("button", { name: /👍 1/ })).toBeVisible();
    await expect(messageBubble(alice, text).getByRole("button", { name: /👍 1/ })).toBeVisible();
    await b.getByRole("button", { name: /👍 1/ }).click();
    await expect(b.getByRole("button", { name: /^👍 \d/ })).toHaveCount(0); // chip gone (the hover-toolbar "React 👍" button stays)
  });

  test("replying shows a quote of the original", async () => {
    const text = uniq("question");
    await send(alice, text);
    const b = messageBubble(mo, text);
    await b.hover();
    await b.getByRole("button", { name: "Reply" }).click();
    await expect(mo.getByText(/Replying to Alice Admin/)).toBeVisible();
    const answer = uniq("answer");
    await send(mo, answer);
    const reply = messageBubble(alice, answer);
    await expect(reply).toBeVisible();
    await expect(reply).toContainText(text);
    await expect(mo.getByText(/Replying to/)).toHaveCount(0);
  });

  test("editing updates the text with an (edited) marker for the other person", async () => {
    const text = uniq("typo");
    await send(alice, text);
    await expect(messageBubble(alice, text)).toBeVisible();
    const b = messageBubble(alice, text);
    await b.hover();
    await b.getByRole("button", { name: "Edit message" }).click();
    await expect(alice.getByText(/Editing message/)).toBeVisible();
    const fixed = uniq("fixed");
    await alice.getByPlaceholder("Type a message").fill(fixed);
    await alice.getByPlaceholder("Type a message").press("Enter");
    await expect(messageBubble(mo, fixed)).toBeVisible();
    await expect(messageBubble(mo, fixed)).toContainText("(edited)");
    await expect(mo.getByText(text, { exact: false })).toHaveCount(0);
  });

  test("ArrowUp in an empty composer edits your last message", async () => {
    const text = uniq("edit me with arrow");
    await send(alice, text);
    await expect(messageBubble(alice, text)).toBeVisible();
    const box = alice.getByPlaceholder("Type a message");
    await box.click();
    await box.press("ArrowUp");
    await expect(box).toHaveValue(text);
    await box.press("Escape");
    await expect(box).toHaveValue("");
  });

  test("deleting removes the message for everyone", async () => {
    const text = uniq("delete me");
    await send(alice, text);
    const b = messageBubble(alice, text);
    await expect(messageBubble(mo, text)).toBeVisible();
    await b.hover();
    await b.getByRole("button", { name: "Delete message" }).click();
    await alice.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(messageBubble(alice, text)).toHaveCount(0);
    await expect(messageBubble(mo, text)).toHaveCount(0);
  });

  test("a member cannot delete someone else's message from the UI", async () => {
    const text = uniq("alice's own");
    await send(alice, text);
    const b = messageBubble(mo, text);
    await expect(b).toBeVisible();
    await expect(b.getByRole("button", { name: "Delete message" })).toHaveCount(0);
    await expect(b.getByRole("button", { name: "Edit message" })).toHaveCount(0);
  });

  test("search finds a message with the / shortcut", async () => {
    const text = uniq("searchable needle");
    await send(alice, text);
    await expect(messageBubble(mo, text)).toBeVisible();
    await mo.locator("body").click({ position: { x: 5, y: 5 } });
    await mo.keyboard.press("/");
    await mo.getByRole("dialog", { name: "Search messages" }).getByRole("textbox").fill("searchable needle");
    await expect(mo.getByRole("dialog", { name: "Search messages" }).getByText(text)).toBeVisible();
  });

  test("image upload shows the image to the other person", async () => {
    await alice.locator('input[type="file"]').setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
    await expect(alice.getByText("dot.png")).toBeVisible();
    await alice.getByRole("button", { name: "Send message" }).click();
    await expect(mo.getByAltText("Shared image").last()).toBeVisible({ timeout: 10_000 });
  });

  test("typing indicator shows the person's name", async () => {
    await alice.getByPlaceholder("Type a message").pressSequentially("typing something", { delay: 30 });
    await expect(mo.getByText(/Alice Admin is typing/)).toBeVisible();
  });

  test("'Seen by' appears under your last message once the other person has it open", async () => {
    const text = uniq("did you see this");
    await send(alice, text);
    await expect(alice.getByText(/Seen by Mo/)).toBeVisible({ timeout: 10_000 });
  });

  test("typing @ suggests members; picking one inserts the name and highlights it for the other person", async () => {
    const box = alice.getByPlaceholder("Type a message");
    await box.click();
    await box.pressSequentially("hello @Mo");
    const option = alice.getByRole("option", { name: /Mo Member/ });
    await expect(option).toBeVisible();
    await box.press("Enter"); // accepts the suggestion instead of sending
    await expect(box).toHaveValue("hello @Mo Member ");
    await box.pressSequentially(uniq("check this"));
    await box.press("Enter");
    const bubble = messageBubble(mo, "check this");
    await expect(bubble).toBeVisible();
    await expect(bubble.getByText("@Mo Member")).toBeVisible();
  });

  test("Escape dismisses the mention list without sending", async () => {
    const box = alice.getByPlaceholder("Type a message");
    await box.click();
    await box.pressSequentially("hi @Mo");
    await expect(alice.getByRole("option", { name: /Mo Member/ })).toBeVisible();
    await box.press("Escape");
    await expect(alice.getByRole("option")).toHaveCount(0);
    await expect(box).toHaveValue("hi @Mo");
  });

  test("command palette opens with Ctrl+K and closes with Escape; theme toggle flips the dark class", async () => {
    await mo.keyboard.press("Control+k");
    await expect(mo.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await mo.keyboard.press("Escape");
    await expect(mo.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
    const html = mo.locator("html");
    const before = await html.evaluate((el) => el.classList.contains("dark"));
    await mo.getByRole("button", { name: /Switch to (dark|light) theme/ }).click();
    expect(await html.evaluate((el) => el.classList.contains("dark"))).toBe(!before);
  });
});
