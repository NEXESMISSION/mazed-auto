// ============================================================================
// 0194 — admin_set_user_role is the one way to change a role, and only an
// admin gets through it.
//
// The admin here is made the way the console sees one: profiles.role='admin'
// with no JWT claim, exactly what requireAdmin() checks. Everything else goes
// through the REST API with a real token, as the route (or anyone holding the
// anon key) would.
//
//   * an admin's session changes a role, and the auth app_metadata claim
//     follows it — including back down from admin;
//   * a non-admin token, anon and the service role are all refused, and the
//     service role cannot write profiles.role directly either;
//   * an admin cannot remove their own admin role; retired roles and unknown
//     users are refused.
// ============================================================================
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const FN = "public.admin_set_user_role(uuid, public.user_role)";

let svc: SupabaseClient;
let db: Client;
let boss: TestUser;
let target: TestUser;
let other: TestUser;

/** Set a role behind the guard's back, the way a migration would. */
async function forceRole(id: string, role: string) {
  await db.query("begin");
  try {
    await db.query(`select set_config('app.bypass_profile_guard', 'on', true)`);
    await db.query(`update public.profiles set role = $2::public.user_role where id = $1`, [id, role]);
    await db.query(
      `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
        where id = $1`,
      [id],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function roleOf(id: string): Promise<string> {
  const res = await db.query(`select role::text as role from public.profiles where id = $1`, [id]);
  return res.rows[0].role;
}

async function claimOf(id: string): Promise<string | undefined> {
  const { data, error } = await svc.auth.admin.getUserById(id);
  if (error) throw new Error(`getUserById failed: ${error.message}`);
  return data.user.app_metadata?.role as string | undefined;
}

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();

  boss = await createUser(svc);
  target = await createUser(svc);
  other = await createUser(svc);
  await forceRole(boss.id, "admin");
});

beforeEach(async () => {
  await forceRole(target.id, "individual");
  await forceRole(other.id, "individual");
});

afterAll(async () => {
  await deleteUsers(svc, [boss, target, other].filter(Boolean));
  await db?.end().catch(() => {});
});

describe("0194 — an admin changes a role", () => {
  it("moves a user to agency and mirrors the role into the JWT claim", async () => {
    const { error } = await boss.client.rpc("admin_set_user_role", {
      p_user_id: target.id,
      p_role: "agency",
    });
    expect(error).toBeNull();
    expect(await roleOf(target.id)).toBe("agency");
    expect(await claimOf(target.id)).toBe("agency");
  });

  it("promotes to admin and demotes again, the claim following both ways", async () => {
    const up = await boss.client.rpc("admin_set_user_role", {
      p_user_id: target.id,
      p_role: "admin",
    });
    expect(up.error).toBeNull();
    expect(await roleOf(target.id)).toBe("admin");
    expect(await claimOf(target.id)).toBe("admin");

    const down = await boss.client.rpc("admin_set_user_role", {
      p_user_id: target.id,
      p_role: "individual",
    });
    expect(down.error).toBeNull();
    expect(await roleOf(target.id)).toBe("individual");
    // A stale `admin` claim would keep is_admin() true for the demoted user.
    expect(await claimOf(target.id)).toBe("individual");
  });

  it("refuses an admin removing their own admin role", async () => {
    const { error } = await boss.client.rpc("admin_set_user_role", {
      p_user_id: boss.id,
      p_role: "individual",
    });
    expect(error?.message).toBe("cannot_demote_self");
    expect(await roleOf(boss.id)).toBe("admin");
  });

  it("refuses the retired roles", async () => {
    for (const role of ["bank", "bailiff", "inspector"]) {
      const { error } = await boss.client.rpc("admin_set_user_role", {
        p_user_id: target.id,
        p_role: role,
      });
      expect(error?.message).toBe("invalid_role");
    }
    expect(await roleOf(target.id)).toBe("individual");
  });

  it("reports a user that does not exist", async () => {
    const { error } = await boss.client.rpc("admin_set_user_role", {
      p_user_id: randomUUID(),
      p_role: "agency",
    });
    expect(error?.message).toBe("user_not_found");
  });
});

describe("0194 — nobody else changes a role", () => {
  it("refuses a non-admin token with forbidden, for another user or themself", async () => {
    for (const id of [target.id, other.id]) {
      const { error } = await other.client.rpc("admin_set_user_role", {
        p_user_id: id,
        p_role: "admin",
      });
      expect(error?.code).toBe("42501");
      expect(error?.message).toBe("forbidden");
    }
    expect(await roleOf(target.id)).toBe("individual");
    expect(await roleOf(other.id)).toBe("individual");
  });

  it("refuses anon", async () => {
    const { error } = await anon().rpc("admin_set_user_role", {
      p_user_id: target.id,
      p_role: "admin",
    });
    expect(error?.code).toBe("42501");
    expect(await roleOf(target.id)).toBe("individual");
  });

  it("refuses the service role, through the function and through the table", async () => {
    const viaRpc = await svc.rpc("admin_set_user_role", {
      p_user_id: target.id,
      p_role: "admin",
    });
    expect(viaRpc.error?.code).toBe("42501");

    const direct = await svc.from("profiles").update({ role: "admin" }).eq("id", target.id);
    expect(direct.error?.message).toContain(
      "forbidden: cannot change protected column without admin",
    );
    expect(await roleOf(target.id)).toBe("individual");
  });

  it("refuses a non-admin writing their own role through the table", async () => {
    const { error } = await other.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", other.id);
    expect(error).not.toBeNull();
    expect(await roleOf(other.id)).toBe("individual");
  });

  it("is executable by authenticated only", async () => {
    const res = await db.query(
      `select r as role, has_function_privilege(r, $1, 'execute') as ok
         from unnest(array['anon', 'authenticated', 'service_role']) as r`,
      [FN],
    );
    expect(Object.fromEntries(res.rows.map((row) => [row.role, row.ok]))).toEqual({
      anon: false,
      authenticated: true,
      service_role: false,
    });
  });
});
