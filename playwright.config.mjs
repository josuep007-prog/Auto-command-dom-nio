import { defineConfig } from "@playwright/test";

/* O programa e usado abrindo o arquivo direto de uma pasta de rede, entao os
 * testes tambem carregam por file:// — e o mesmo contexto de seguranca do uso
 * real. Nao ha servidor para subir. */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  /* servido.spec.mjs carrega src/ por HTTP, com os modulos ES separados — o
     mesmo caminho que o servidor entregara. Os demais testes usam file://. */
  webServer: {
    command: "npx http-server src -p 4173 -c-1 --silent",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true,
    timeout: 30_000,
  },
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
