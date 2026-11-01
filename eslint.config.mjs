import next from "eslint-config-next";

const config = [{ ignores: [".next/**", "drizzle/**"] }, ...next];
export default config;
