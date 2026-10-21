import { useOnboarding } from "./OnboardingContext";
import { CreateLogin } from "./steps/CreateLogin";
import { YourName } from "./steps/YourName";
import { Consent } from "./steps/Consent";
import { VerifyEmail } from "./steps/VerifyEmail";
import { ChildName } from "./steps/ChildName";
import { ChildDob } from "./steps/ChildDob";
import { ChildGender } from "./steps/ChildGender";
import { ChildTherapies } from "./steps/ChildTherapies";
import { ChildSchedule } from "./steps/ChildSchedule";
import { ChildIep } from "./steps/ChildIep";
import { Done } from "./steps/Done";

export function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
  const { stepId } = useOnboarding();

  switch (stepId) {
    case "create-login":
      return <CreateLogin />;
    case "your-name":
      return <YourName />;
    case "consent":
      return <Consent />;
    case "verify-email":
      return <VerifyEmail />;
    case "child-name":
      return <ChildName />;
    case "child-dob":
      return <ChildDob />;
    case "child-gender":
      return <ChildGender />;
    case "child-therapies":
      return <ChildTherapies />;
    case "child-schedule":
      return <ChildSchedule />;
    case "child-iep":
      return <ChildIep />;
    case "done":
      return <Done onFinish={onFinish} />;
  }
}
