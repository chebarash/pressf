import next from "eslint-config-next";

const config = [{ ignores: [".next/**", "drizzle/**", "public/mediapipe/**", ".claude/**"] }, ...next];
export default config;
