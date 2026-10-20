import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Goal } from "../../api/types";
import { RealActivitiesView } from "./realActivities";

export function KidActivitiesTab({ kidId, kidLabel }: { kidId: string; kidLabel: string }) {
  const { token } = useAuth();
  const [goals, setGoals] = useState<Goal[] | null>(null);

  useEffect(() => {
    setGoals(null);
    api.listGoals(token!, kidId).then(setGoals);
  }, [token, kidId]);

  if (!goals) return <p className="empty-state">Loading...</p>;
  return <RealActivitiesView kidLabel={kidLabel} goals={goals} />;
}
