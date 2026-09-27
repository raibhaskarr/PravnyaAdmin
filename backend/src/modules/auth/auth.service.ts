import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { signToken } from "../../common/middleware/auth";
import { AppError } from "../../common/errors/AppError";
import { LoginInput } from "./auth.schemas";

export const authService = {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    const token = signToken({ id: user.id, role: user.role, tenantId: user.tenantId });
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId }
    };
  },

  hashPassword(password: string) {
    return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  }
};
