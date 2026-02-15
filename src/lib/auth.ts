import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            ...schema,
            user: schema.users,
        },
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    trustedOrigins: [
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ],
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 6,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 5, // 5 days in seconds
        cookieCache: {
            enabled: true,
            maxAge: 60 * 5, // 5 minutes
        },
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "user",
                input: false,
            },
            firebaseUid: {
                type: "string",
                required: false,
                input: false,
            },
            preferences: {
                type: "string", // stored as JSON string, parsed at app level
                defaultValue: "{}",
                input: false,
            },
        },
    },
    advanced: {
        cookiePrefix: "better-auth",
        useSecureCookies: isProduction,
        crossSubDomainCookies: {
            enabled: false,
        },
        database: {
            generateId: () => crypto.randomUUID(),
        },
    },
});
