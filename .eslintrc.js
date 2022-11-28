module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ["import", "@typescript-eslint", "prettier"],
  extends: [
    "standard",
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:import/typescript", // Cf. https://github.com/benmosher/eslint-plugin-import#typescript
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
    project: "tsconfig.eslint.json",
    sourceType: "module",
  },
  rules: {
    "no-void": "off",
    "node/no-unsupported-features/es-syntax": [
      "error",
      { ignores: ["modules"] },
    ],
    "import/no-unresolved": "error",
  },
  settings: {
    node: {
      tryExtensions: [".js", ".json", ".node", ".ts", ".d.ts"],
    },
    "import/parsers": {
      "@typescript-eslint/parser": [".ts", ".tsx"],
    },
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,

        // Omitting `"project"` loads <rootdir>/tsconfig.json to eslint by default.
      },
    },
  },
}
