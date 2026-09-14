import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // The framework, router and HTTP client change far less often than the
        // application, so they get chunks of their own: a release that only
        // touches HR Nexus code leaves them cached in the browser. Pages were
        // already split per route in App.tsx.
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "vendor-router", test: /node_modules[\\/](react-router|react-router-dom)[\\/]/ },
            { name: "vendor-http", test: /node_modules[\\/]axios[\\/]/ },
          ],
        },
      },
    },
  },
});
