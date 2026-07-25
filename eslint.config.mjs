import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next only wires 6 baseline jsx-a11y rules; layer the
  // plugin's full `recommended` rule set on top for real coverage (label
  // association, click-handler-without-keyboard-handler, anchor validity,
  // heading order, etc.). Only `rules` here, not the whole flat config
  // object — `eslint-config-next` already registers the `jsx-a11y` plugin
  // itself, and flat config errors if two config objects each redeclare the
  // same plugin key.
  {
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  {
    rules: {
      // Server Action / useActionState signatures require positional params
      // (e.g. `prevState`, `formData`) that some adapters don't use — the
      // `_` prefix is this codebase's convention for "intentionally unused".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Playwright fixtures (e2e/fixtures.ts) take a `use` callback param per
    // Playwright's own API — react-hooks/rules-of-hooks misreads that as the
    // React 19 `use()` hook. This directory has no React in it.
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
