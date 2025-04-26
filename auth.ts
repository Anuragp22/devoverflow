import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { IAccountDoc } from "./database/account.model";
import { IUserDoc } from "./database/user.model";
import { api } from "./lib/api";
import { SignInSchema } from "./lib/validations";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub,
    Google,
    Credentials({
      async authorize(credentials) {
        try {
          const validatedFields = SignInSchema.safeParse(credentials);

          if (!validatedFields.success) {
            console.error(
              "[Credentials Authorize] Validation failed:",
              validatedFields.error.flatten()
            );
            return null;
          }

          const { email, password } = validatedFields.data;

          const { data: existingAccount } = (await api.accounts.getByProvider(
            email
          )) as ActionResponse<IAccountDoc>;

          if (!existingAccount) {
            console.error(
              "[Credentials Authorize] No account found for email:",
              email
            );
            return null;
          }

          const { data: existingUser } = (await api.users.getById(
            existingAccount.userId.toString()
          )) as ActionResponse<IUserDoc>;

          if (!existingUser) {
            console.error(
              "[Credentials Authorize] No user found for account userId:",
              existingAccount.userId
            );
            return null;
          }

          const isValidPassword = await bcrypt.compare(
            password,
            existingAccount.password!
          );

          if (!isValidPassword) {
            console.error(
              "[Credentials Authorize] Invalid password for email:",
              email
            );
            return null;
          }

          return {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            image: existingUser.image,
          };
        } catch (error) {
          console.error("[Credentials Authorize] Unexpected error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      try {
        session.user.id = token.sub as string;
        return session;
      } catch (error) {
        console.error(
          "[Session Callback] Error setting session user ID:",
          error
        );
        return session;
      }
    },
    async jwt({ token, account }) {
      try {
        if (account) {
          const { data: existingAccount, success } =
            (await api.accounts.getByProvider(
              account.type === "credentials"
                ? token.email!
                : account.providerAccountId
            )) as ActionResponse<IAccountDoc>;

          if (!success || !existingAccount) {
            console.error(
              "[JWT Callback] No account found for:",
              token.email || account.providerAccountId
            );
            return token;
          }

          const userId = existingAccount.userId;

          if (userId) token.sub = userId.toString();
        }

        return token;
      } catch (error) {
        console.error("[JWT Callback] Unexpected error:", error);
        return token;
      }
    },
    async signIn({ user, profile, account }) {
      try {
        if (account?.type === "credentials") return true;

        if (!account || !user) {
          console.error(
            "[SignIn Callback] Missing account or user information"
          );
          return false;
        }

        const userInfo = {
          name: user.name!,
          email: user.email!,
          image: user.image!,
          username:
            account.provider === "github"
              ? (profile?.login as string)
              : (user.name?.toLowerCase() as string),
        };

        const { success } = (await api.auth.oAuthSignIn({
          user: userInfo,
          provider: account.provider as "github" | "google",
          providerAccountId: account.providerAccountId,
        })) as ActionResponse;

        if (!success) {
          console.error(
            "[SignIn Callback] OAuth signup failed for provider:",
            account.provider
          );
          return false;
        }

        return true;
      } catch (error) {
        console.error(
          "[SignIn Callback] Unexpected error during OAuth signup:",
          error
        );
        return false;
      }
    },
  },
});
