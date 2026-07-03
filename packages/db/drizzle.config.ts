import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from packages/db; load the single repo-root .env.
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
