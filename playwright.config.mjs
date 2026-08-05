import { defineConfig } from "@playwright/test";

/* O programa e usado abrindo o arquivo direto de uma pasta de rede, entao os
 * testes tambem carregam por file:// — e o mesmo contexto de seguranca do uso
 * real. Nao ha servidor para subir. */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      /* o app baixa .txt/.csv/.xlsx via blob: URL; sem isso o Chromium
         bloqueia o download no contexto file:// */
      args: ["--allow-file-access-from-files"],
    },
  },
  projects: [{ name: "chromium", use: { channel: undefined, browserName: "chromium" } }],
});
