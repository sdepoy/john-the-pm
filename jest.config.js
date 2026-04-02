/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "**/__tests__/realtime/sse.test.ts",
        "**/__tests__/ai/**/*.test.ts",
        "**/__tests__/api/**/*.test.ts",
      ],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { strict: true } }],
      },
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
      },
    },
    {
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["**/__tests__/realtime/useProjectStream.test.tsx"],
      transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { strict: true } }],
      },
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
      },
    },
  ],
};
