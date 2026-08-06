import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", ".open-next/**", "node_modules/**", "prisma/generated/**"] },
  ...nextCoreWebVitals,
];

export default config;
