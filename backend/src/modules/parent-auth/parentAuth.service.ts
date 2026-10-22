import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { signParentToken } from "../../common/middleware/parentAuth";
import { AppError } from "../../common/errors/AppError";
import { invitationEmailService } from "../therapist-invitations/invitationEmail.service";
import { LoginInput, RegisterInput, ResetPasswordInput, SendVerificationCodeInput } from "./parentAuth.schemas";

const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  // 6 digits, zero-padded -- crypto-random would be nicer but this matches a 10-minute,
  // single-use, rate-limitable code's actual threat model; see "not built this pass" note in
  // parentAuth.routes.ts about rate limiting.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function parentPublicShape(parent: { id: string; email: string; displayName: string | null }) {
  return { id: parent.id, email: parent.email, name: parent.displayName };
}

// Shared by register() and resetPassword() -- both need "prove you own this inbox" as a
// prerequisite, just with a different action afterward. Single-use: deletes the row on success,
// so a caller never needs to remember to do it separately (and can't accidentally redeem the same
// code twice across the two different flows).
async function verifyAndConsumeCode(email: string, code: string): Promise<void> {
  const verification = await prisma.parentVerificationCode.findUnique({ where: { email } });
  if (!verification || verification.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_CODE", "This code has expired. Request a new one.");
  }
  const codeValid = await bcrypt.compare(code, verification.codeHash);
  if (!codeValid) throw new AppError(400, "INVALID_CODE", "Incorrect verification code.");
  await prisma.parentVerificationCode.delete({ where: { email } });
}

export const parentAuthService = {
  async sendVerificationCode(input: SendVerificationCodeInput) {
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, env.BCRYPT_SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // One outstanding code per email -- a new send invalidates any previous one rather than
    // allowing several valid codes to exist at once.
    await prisma.parentVerificationCode.upsert({
      where: { email: input.email },
      create: { email: input.email, codeHash, expiresAt },
      update: { codeHash, expiresAt }
    });

    await invitationEmailService.sendParentVerificationCode({ to: input.email, code });
    return { sent: true };
  },

  async register(input: RegisterInput) {
    await verifyAndConsumeCode(input.email, input.verificationCode);

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

    const existing = await prisma.parent.findUnique({ where: { email: input.email } });
    let parent;
    if (existing) {
      if (existing.passwordHash) {
        // Already claimed by a previous registration -- don't silently reset their password via
        // the register flow, that's resetPassword()'s job, with its own explicit intent.
        throw new AppError(409, "ALREADY_REGISTERED", "An account with this email already exists. Try signing in instead.");
      }
      parent = await prisma.parent.update({
        where: { id: existing.id },
        data: { passwordHash, emailVerifiedAt: new Date(), displayName: input.name }
      });
    } else {
      parent = await prisma.parent.create({
        data: { email: input.email, passwordHash, emailVerifiedAt: new Date(), displayName: input.name }
      });
    }

    const token = signParentToken(parent.id);
    return { token, parent: parentPublicShape(parent) };
  },

  async resetPassword(input: ResetPasswordInput) {
    await verifyAndConsumeCode(input.email, input.verificationCode);

    const parent = await prisma.parent.findUnique({ where: { email: input.email } });
    // Unlike login()'s deliberately generic message, this can be specific: redeeming the code
    // already proved they own this inbox, so "no account here" isn't leaking anything they didn't
    // already have the means to find out -- and they genuinely need to know, to go register
    // instead rather than being stuck on a reset flow that can never work.
    if (!parent || !parent.passwordHash) {
      throw new AppError(404, "NO_ACCOUNT", "No account found for this email. Try creating one instead.");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);
    const updated = await prisma.parent.update({ where: { id: parent.id }, data: { passwordHash } });

    const token = signParentToken(updated.id);
    return { token, parent: parentPublicShape(updated) };
  },

  async login(input: LoginInput) {
    const parent = await prisma.parent.findUnique({ where: { email: input.email } });
    // Same message whether the email doesn't exist or just has no password set yet (never
    // registered) -- avoids confirming which emails exist in the system.
    if (!parent || !parent.passwordHash) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    const valid = await bcrypt.compare(input.password, parent.passwordHash);
    if (!valid) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password");

    const token = signParentToken(parent.id);
    return { token, parent: parentPublicShape(parent) };
  },

  async me(parentId: string) {
    const parent = await prisma.parent.findUniqueOrThrow({
      where: { id: parentId },
      include: { kids: { select: { id: true, firstName: true, lastName: true, dob: true, gender: true } } }
    });
    return { ...parentPublicShape(parent), kids: parent.kids };
  }
};
