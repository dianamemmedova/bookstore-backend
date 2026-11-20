import bcrypt from "bcryptjs";
import type { Role } from "../generated/prisma/client";
import { signToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { isPrismaError, PrismaErrorCode } from "../lib/prisma-errors";
import { ConflictError, UnauthorizedError } from "../lib/errors";
import type { RegisterInput } from "../schemas/auth.schema";

export const SALT_ROUNDS = 10;

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", SALT_ROUNDS);

export type PublicUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdAt: Date;
};

export const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
} as const;

function toAuthResult(user: PublicUser) {
  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

export async function registerUser(input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        marketingOptIn: input.marketingOptIn,
      },
      select: publicUserSelect,
    });
    return toAuthResult(user);
  } catch (error: unknown) {
    if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
      throw new ConflictError("Bu email artıq qeydiyyatdan keçib", "EMAIL_TAKEN");
    }
    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const found = await prisma.user.findUnique({ where: { email } });

  const hash = found?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!found || !valid) {
    throw new UnauthorizedError("Email və ya parol yanlışdır");
  }

  return toAuthResult({
    id: found.id,
    email: found.email,
    firstName: found.firstName,
    lastName: found.lastName,
    role: found.role,
    createdAt: found.createdAt,
  });
}