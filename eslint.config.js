import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "data/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // worldgen must stay pure (SPEC §4, §15.2): no DOM, no network, no Math.random.
    files: ["packages/worldgen/src/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "worldgen is pure: no DOM." },
        { name: "document", message: "worldgen is pure: no DOM." },
        { name: "fetch", message: "worldgen is pure: no network." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use rng.ts seeded by OSM id." },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}", "**/vite.config.ts", "tools/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
