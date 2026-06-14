import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        // Allow jest globals without a separate tsconfig for tests
        types: ["jest"],
        module: "commonjs",
        moduleResolution: "node",
      },
    }],
  },
};

export default config;
