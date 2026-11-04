import next from "eslint-config-next";

const config = [{ ignores: [".next/**", "drizzle/**", "public/mediapipe/**"] }, ...next];
export default config;
