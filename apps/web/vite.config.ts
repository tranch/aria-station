import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
