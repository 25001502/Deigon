import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",

    initShadowDb: `
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id TEXT NOT NULL,
        email TEXT NOT NULL,
        raw_user_meta_data JSONB
      );
    `,
  },

  datasource: {
    url: process.env.DIRECT_URL!,
  },

  experimental: {
    externalTables: true,
  },

  tables: {
    external: ["auth.users"],
  },
});