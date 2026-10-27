// ProShield Time Tracker — "clickup-tasks" Supabase Edge Function
// Securely pulls this week's task status from ClickUp for the Tasks tab.
// The ClickUp token lives here as a server secret, never in the public page.
// Deploy as: supabase/functions/clickup-tasks/index.ts
//
// Required secret (set in Supabase): CLICKUP_TOKEN
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLICKUP_TOKEN = Deno.env.get("CLICKUP_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The "Projects" folder lists: ADLr Phase 1, Accorda Phase 1, PRO SHIELD, Wolf Ventures
const LIST_IDS = ["901313357978", "901313357979", "901327261135", "1000440000015805"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 1) Only a signed-in manager may call this.
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Not signed in" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: u, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !u?.user) return json({ error: "Not signed in" }, 401);
    const { data: prof } = await admin.from("profiles").select("is_manager").eq("id", u.user.id).single();
    if (!prof?.is_manager) return json({ error: "Managers only" }, 403);

    // 2) Pull every task from the four Projects lists (paginated).
    const tasks: any[] = [];
    for (const listId of LIST_IDS) {
      for (let page = 0; page < 20; page++) {
        const url = `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`;
        const res = await fetch(url, { headers: { Authorization: CLICKUP_TOKEN } });
        if (!res.ok) break;
        const body = await res.json();
        const batch = body.tasks || [];
        tasks.push(...batch);
        if (batch.length < 100) break; // last page
      }
    }

    // 3) Aggregate done-this-week and still-open, per assignee.
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const people: Record<string, any> = {};
    const bump = (name: string) => (people[name] ||= { name, completedCount: 0, open: [] });

    for (const t of tasks) {
      const assignees = (t.assignees || []).map((a: any) => a.username || a.email || "Unassigned");
      const names = assignees.length ? assignees : ["Unassigned"];
      const closed = t.date_closed ? Number(t.date_closed) : null;
      const isDone = !!closed;
      const due = t.due_date ? Number(t.due_date) : null;
      const listName = t.list?.name || "";

      for (const name of names) {
        const p = bump(name);
        if (isDone) {
          if (closed! >= weekAgo) p.completedCount++;
        } else {
          const overdue = !!(due && due < now);
          p.open.push({
            title: t.name,
            url: t.url,
            list: listName,
            due: due ? new Date(due).toISOString() : null,
            overdue,
            daysLate: overdue ? Math.floor((now - due!) / 86400000) : 0,
          });
        }
      }
    }

    // Sort each person's open items: overdue first, most overdue first.
    const result = Object.values(people)
      .map((p: any) => {
        p.open.sort((a: any, b: any) =>
          (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || b.daysLate - a.daysLate);
        return p;
      })
      // Show people who have something open or completed this week; drop empty rows.
      .filter((p: any) => p.open.length || p.completedCount)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return json({ generatedAt: new Date().toISOString(), people: result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
