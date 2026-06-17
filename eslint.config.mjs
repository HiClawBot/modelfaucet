import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/*.js",
      "**/*.mjs",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended
);
