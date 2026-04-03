import mongoose from "mongoose";
import { NextResponse } from "next/server";
import slugify from "slugify";

import Account from "@/database/account.model";
import User from "@/database/user.model";
import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { SignInWithOAuthSchema } from "@/lib/validations";

async function resolveUniqueUsername(
  username: string,
  session: mongoose.ClientSession
) {
  const baseUsername =
    slugify(username, {
      lower: true,
      strict: true,
      trim: true,
    }) || "user";

  let candidate = baseUsername;
  let suffix = 1;

  while (await User.exists({ username: candidate }).session(session)) {
    candidate = `${baseUsername}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function POST(request: Request) {
  const { provider, providerAccountId, user } = await request.json();

  await dbConnect();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const validatedData = SignInWithOAuthSchema.safeParse({
      provider,
      providerAccountId,
      user,
    });

    if (!validatedData.success)
      throw new ValidationError(validatedData.error.flatten().fieldErrors);

    const { name, username, email, image } = user;
    const normalizedEmail = email.trim().toLowerCase();

    let existingUser = await User.findOne({ email: normalizedEmail }).session(
      session
    );

    if (!existingUser) {
      const slugifiedUsername = await resolveUniqueUsername(username, session);

      [existingUser] = await User.create(
        [
          {
            name: name.trim(),
            username: slugifiedUsername,
            email: normalizedEmail,
            image,
          },
        ],
        { session }
      );
    } else {
      const updatedData: { name?: string; image?: string } = {};

      if (existingUser.name !== name) updatedData.name = name;
      if (existingUser.image !== image) updatedData.image = image;

      if (Object.keys(updatedData).length > 0) {
        await User.updateOne(
          { _id: existingUser._id },
          { $set: updatedData }
        ).session(session);
      }
    }

    const existingAccount = await Account.findOne({
      userId: existingUser._id,
      provider,
      providerAccountId,
    }).session(session);

    if (!existingAccount) {
      await Account.create(
        [
          {
            userId: existingUser._id,
            name,
            image,
            provider,
            providerAccountId,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    await session.abortTransaction();
    return handleError(error, "api") as APIErrorResponse;
  } finally {
    await session.endSession();
  }
}
