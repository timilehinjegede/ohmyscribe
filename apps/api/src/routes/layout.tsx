/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { Child } from "hono/jsx";

// One stylesheet for the whole reviewer surface.
const STYLES = `
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f6f6f8; color: #1c2024; }
  header { background: #732ebb; color: #fff; padding: 12px 24px; }
  header a { color: #fff; text-decoration: none; font-weight: 600; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { border: 1px solid #e3e4e8; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 14px; }
  th { background: #eeeef2; }
  tr.disagrees { background: #fdecec; }
  .muted { color: #60646c; }
  .snippet { color: #60646c; font-style: italic; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #e0e1e6; }
  .status.returned { background: #fce9ea; color: #c62a2f; }
  .status.pending_review { background: #f0e7fb; color: #732ebb; }
  .status.approved { background: #e4f5e9; color: #1b9e4b; }
  form.action { margin-top: 12px; padding: 12px; background: #fff; border: 1px solid #e3e4e8; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #60646c; }
  textarea { min-width: 320px; }
  button { padding: 8px 18px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
  button.approve { background: #1b9e4b; color: #fff; }
  button.return { background: #c62a2f; color: #fff; }
  ul.flags { padding-left: 18px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { position: relative; background: #e0e1e6; border-radius: 4px; height: 12px; min-width: 140px; overflow: hidden; }
  .bar > span { display: block; background: #732ebb; height: 100%; }
  .rate { display: flex; align-items: center; gap: 8px; }
`;

export function Layout({ title, children }: { title: string; children: Child }) {
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          <style>{STYLES}</style>
        </head>
        <body>
          <header>
            <a href="/review">OhMyScribe · Review queue</a>
            {" · "}
            <a href="/reviewer/analytics">Analytics</a>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </>
  );
}
