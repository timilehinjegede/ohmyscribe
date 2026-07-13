/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { Child } from "hono/jsx";

// One stylesheet for the whole reviewer surface.
const STYLES = `
  :root {
    --text: #11181C; --text-secondary: #60646C;
    --background: #FFFFFF; --background-element: #F0F0F3; --background-selected: #E0E1E6;
    --border: #E6E7EB;
    --accent: #732EBB; --accent-muted: #F0E7FB; --on-accent: #FFFFFF;
    --success: #1B9E4B; --success-muted: #E4F5E9;
    --danger: #E5484D; --danger-muted: #FCE9EA;
  }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--background-element); color: var(--text); font-size: 14px; line-height: 20px; }
  header { display: flex; align-items: center; gap: 20px; background: var(--accent); padding: 10px 24px; }
  header .brand { color: var(--on-accent); text-decoration: none; font-weight: 700; }
  header nav { display: flex; gap: 6px; }
  header nav a { color: var(--on-accent); opacity: 0.75; text-decoration: none; font-weight: 500; font-size: 14px; padding: 6px 12px; border-radius: 999px; }
  header nav a.active { opacity: 1; background: rgba(255, 255, 255, 0.18); font-weight: 600; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; font-weight: 700; }
  h2 { font-size: 16px; font-weight: 600; margin-top: 32px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--background); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; vertical-align: top; font-size: 14px; border-bottom: 1px solid var(--border); }
  th { color: var(--text-secondary); font-weight: 600; }
  tr:last-child td, tr:last-child th { border-bottom: none; }
  tr.disagrees td { background: var(--danger-muted); }
  .muted { color: var(--text-secondary); }
  .snippet { color: var(--text-secondary); font-style: italic; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--background-selected); }
  .status.returned { background: var(--danger-muted); color: var(--danger); }
  .status.pending_review { background: var(--accent-muted); color: var(--accent); }
  .status.approved { background: var(--success-muted); color: var(--success); }
  ul.flags { list-style: none; padding: 0; display: grid; gap: 8px; }
  ul.flags li { background: var(--background); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .action { margin-top: 16px; padding: 16px; background: var(--background); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 12px; }
  .action textarea { width: 100%; box-sizing: border-box; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
  textarea, select { font: inherit; color: var(--text); background: var(--background); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
  textarea { min-width: 320px; resize: none; }
  ::placeholder { color: var(--text-secondary); opacity: 0.7; }
  select { appearance: none; -webkit-appearance: none; background: var(--background) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2360646C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center; padding-right: 32px; min-width: 160px; }
  .action .buttons { display: flex; gap: 8px; justify-content: flex-end; }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  a { color: var(--accent); }
  button { padding: 10px 20px; border: none; border-radius: 10px; font: inherit; font-weight: 600; cursor: pointer; color: var(--on-accent); }
  button.approve { background: var(--success); }
  button.return { background: var(--danger); }
  .num { text-align: right; font-variant-numeric: tabular-nums; width: 90px; white-space: nowrap; }
  .bar { position: relative; background: var(--background-selected); border-radius: 4px; height: 12px; min-width: 140px; overflow: hidden; }
  .bar > span { display: block; background: var(--accent); height: 100%; }
  .rate { display: flex; align-items: center; gap: 8px; }
`;

export function Layout({
  title,
  active,
  children,
}: {
  title: string;
  active: "queue" | "analytics";
  children: Child;
}) {
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
            <a class="brand" href="/review">
              OhMyScribe
            </a>
            <nav>
              <a class={active === "queue" ? "active" : ""} href="/review">
                Review queue
              </a>
              <a class={active === "analytics" ? "active" : ""} href="/reviewer/analytics">
                Analytics
              </a>
            </nav>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </>
  );
}
