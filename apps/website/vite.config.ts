import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.WEBSITE_BASE ?? "/modelfaucet/",
  plugins: [react()],
  build: {
    assetsDir: "site-assets"
  }
});
