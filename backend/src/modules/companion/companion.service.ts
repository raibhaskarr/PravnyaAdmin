import { z } from "zod";
import { createExecutionContext } from "@pravnix/ai-core";
import { prisma } from "../../config/prisma";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { orchestrator } from "../ai/ai.platform";

// The first genuinely open-ended AI surface in this app -- every prior feature (IEP extraction,
// evidence extraction, goal-skill suggestion) only ever matches or extracts against the kid's own
// existing structured data, so there was never a need to spell out what the model shouldn't do.
// This one answers real questions, so the boundary has to be explicit rather than assumed.
const SYSTEM_PROMPT =
  "You are Pravnya, a warm, calm AI companion inside a parent-facing app for families of kids in " +
  "speech, OT, ABA, or physical therapy. A parent just typed a single message into a chat box. " +
  "First decide what it is, then respond.\n\n" +
  "Decide the intent:\n" +
  '- "log": the message describes something that already happened -- practice, a session, ' +
  "something the child did or said -- that the parent is recording, even casually (\"we practiced " +
  'WH questions today, she got three right").\n' +
  '- "question": anything else -- a question, a request for ideas, or asking how the child is ' +
  "doing. If genuinely ambiguous, prefer \"question\" -- it's a reply, not a silent action, so it's " +
  "the safer default.\n\n" +
  'If intent is "log", return only that -- no reply text, the app routes the parent to its own ' +
  "logging screen with what they typed already filled in.\n\n" +
  'If intent is "question", write a warm, concise reply (2-4 sentences -- this renders as a single ' +
  "chat bubble on a phone, not an essay). The parent's child's active goals are listed below when " +
  "available -- use them to ground your answer when the question is actually about this child " +
  "(e.g. \"how is she doing with X\"). For general questions (activity ideas, what a therapy term " +
  "means, typical milestones), answer from general knowledge; you don't need the goals list for " +
  "those.\n\n" +
  "Hard boundary, always: never diagnose, never suggest or discuss medication or dosage, and never " +
  "make a safety-critical clinical judgment call (anything where a wrong answer could cause real " +
  "harm). For those, say warmly that this is exactly the kind of thing to bring to the child's own " +
  "therapist (or a doctor, or emergency services if it sounds urgent) rather than attempting an " +
  "answer yourself -- don't hedge an answer and add a disclaimer, decline the clinical part " +
  "outright and redirect. Stay on topic: this is specifically for questions about the child, their " +
  "therapy, or child development -- if asked something entirely unrelated, say gently that's not " +
  "something you can help with here.\n\n" +
  "Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in " +
  'exactly this shape: {"intent": "log"} or {"intent": "question", "reply": string}.';

const companionResponseSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("log") }),
  z.object({ intent: z.literal("question"), reply: z.string().min(1).max(1200) })
]);

export type CompanionResponse = z.infer<typeof companionResponseSchema>;

export const companionService = {
  async listMessages(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    return prisma.companionMessage.findMany({ where: { kidId }, orderBy: { createdAt: "asc" } });
  },

  async sendMessage(parentId: string, kidId: string, text: string): Promise<CompanionResponse> {
    const kid = await assertOwnsKid(parentId, kidId);
    const kidRecord = await prisma.kid.findUniqueOrThrow({ where: { id: kidId }, select: { firstName: true } });

    await prisma.companionMessage.create({ data: { kidId, role: "PARENT", content: text } });

    // Compact grounding context only -- title/skill/domain, not the full evidence history Growth
    // computes client-side. Enough for the model to answer "how is she doing with X" sensibly
    // without this call re-deriving trend/growth logic that already exists elsewhere.
    const goals = await prisma.goal.findMany({
      where: { kidId, status: "ACTIVE" },
      select: { title: true, canonicalSkill: { select: { name: true, domain: { select: { name: true } } } } }
    });
    const goalsBlock =
      goals.length > 0
        ? `${kidRecord.firstName}'s active goals:\n` + goals.map((g) => `- ${g.title} (${g.canonicalSkill.domain.name} > ${g.canonicalSkill.name})`).join("\n")
        : `${kidRecord.firstName} has no active goals logged yet.`;

    const result = await orchestrator.executeStructured({
      name: "pravnyaadmin.companion-message",
      request: {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: `${kidRecord.firstName}'s parent wrote:\n"${text}"\n\n${goalsBlock}` }] }],
        executionContext: createExecutionContext({ productId: "pravnyaadmin", tenantId: kid.tenantId, featureId: "companion-message" })
      },
      schema: companionResponseSchema,
      maxRepairAttempts: 1
    });

    // Not persisted -- a transient failure, not a real answer; nothing worth keeping in the thread.
    if (!result.success) {
      return { intent: "question", reply: "I couldn't think that through just now -- try again in a moment." };
    }

    if (result.value.intent === "question") {
      await prisma.companionMessage.create({ data: { kidId, role: "ASSISTANT", content: result.value.reply } });
    }

    return result.value;
  }
};
