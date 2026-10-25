import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { StaffCompanionMessage } from "../../api/types";

const ROLE_LABEL: Record<StaffCompanionMessage["role"], string> = { PARENT: "Parent", ASSISTANT: "Pravnya" };

function formatTimestamp(date: string) {
  return new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Read-only mirror of the parent app's own Companion thread on Home -- staff see what a parent
// asked and how Pravnya answered, never reply into it from here.
export function KidCompanionTab({ kidId }: { kidId: string }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<StaffCompanionMessage[] | null>(null);

  useEffect(() => {
    setMessages(null);
    api.listKidCompanionMessages(token!, kidId).then(setMessages);
  }, [token, kidId]);

  if (!messages) return <p className="empty-state">Loading...</p>;
  if (messages.length === 0) return <p className="empty-state">No conversation with Pravnya yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 640 }}>
      {messages.map((m) => (
        <div key={m.id} className={`card companion-message companion-message-${m.role.toLowerCase()}`}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span className="field-label">{ROLE_LABEL[m.role]}</span>
            <span className="hint-text">{formatTimestamp(m.createdAt)}</span>
          </div>
          <p style={{ margin: 0 }}>{m.content}</p>
        </div>
      ))}
    </div>
  );
}
