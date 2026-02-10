import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
      files: ["renderer/scripts/**/*.js"],
      languageOptions: {
        globals: {
          StorageService: "readonly",
          NotificationService: "readonly",
          ValidationService: "readonly",
          getTimesheetSyncErrorMessage: "readonly",
          SupabaseService: "readonly",
          IdleTracker: "readonly",
          Chart: "readonly",
          supabase: "readonly",
          window: "readonly",
          document: "readonly",
        },
      },
  },
]);

