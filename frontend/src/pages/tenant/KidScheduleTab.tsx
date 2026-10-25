import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { ScheduleEntry } from "../../api/types";

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Read-only mirror of the parent app's own Profile > Schedule section -- staff see what a parent
// set up, never create/edit it from here. Already sorted Mon-first by the backend.
export function KidScheduleTab({ kidId }: { kidId: string }) {
  const { token } = useAuth();
  const [slots, setSlots] = useState<ScheduleEntry[] | null>(null);

  useEffect(() => {
    setSlots(null);
    api.listKidSchedule(token!, kidId).then(setSlots);
  }, [token, kidId]);

  if (!slots) return <p className="empty-state">Loading...</p>;
  if (slots.length === 0) return <p className="empty-state">No schedule on file for this kid yet.</p>;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>What</th>
            <th>Therapist</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <td>{s.dayOfWeek}</td>
              <td>{formatTime(s.startTime)}</td>
              <td>{s.label}</td>
              <td>{s.therapist?.name ?? <span className="hint-text">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
