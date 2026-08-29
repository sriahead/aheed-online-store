import { betterAuth } from "better-auth";
const a = betterAuth({ rateLimit: { enabled: true, storage: "database" } });
