import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function tailwindPublicOnly(): PluginOption[] {
  return tailwindcss().map((plugin) => {
    if (
      plugin.name !== "@tailwindcss/vite:generate:build" &&
      plugin.name !== "@tailwindcss/vite:generate:serve"
    ) {
      return plugin;
    }
    const transform = plugin.transform;
    if (!transform || typeof transform !== "object") return plugin;
    return {
      ...plugin,
      transform: {
        ...transform,
        filter: {
          id: {
            include: [/public\.css(?:\?.*)?$/],
            exclude: [/styles\.css/],
          },
        },
      },
    };
  });
}

export default defineConfig({
  plugins: [react(), ...tailwindPublicOnly()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
