import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AuthUser, signToken } from "../../common/middleware/auth";
import { AppError } from "../../common/errors/AppError";
import { ChangePasswordInput, LoginInput } from "./auth.schemas";

export const authService = {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    if (user.role === "THERAPIST") {
      const therapist = await prisma.therapist.findUnique({ where: { userId: user.id }, select: { status: true } });
      if (therapist?.status === "DEACTIVATED") {
        throw new AppError(403, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Contact your centre admin.");
      }
    }

    const token = signToken({ id: user.id, role: user.role, tenantId: user.tenantId });
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId }
    };
  },

  hashPassword(password: string) {
    return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  },

  // Always requires the current password, for every role -- there's no "admin resets someone
  // else's password" path here, only self-service. A user who's lost their password needs a new
  // invite/account-recovery flow, not this endpoint.
  async changePassword(actor: AuthUser, input: ChangePasswordInput) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect");

    const passwordHash = await this.hashPassword(input.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  }
};
