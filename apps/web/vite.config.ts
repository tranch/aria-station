import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonPath = fileURLToPath(new URL("./package.json", import.meta.url));
const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:55290",
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyRequest, request) => {
            // The API validates Origin against Host. Preserve the browser's
            // same-origin host instead of letting the proxy substitute 55290.
            const host = request.headers.host;
            if (host) proxyRequest.setHeader("host", host);
          });
          proxy.on("proxyReqWs", (proxyRequest, request) => {
            const host = request.headers.host;
            if (host) proxyRequest.setHeader("host", host);
          });
        },
      },
    },
  },
});
