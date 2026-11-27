import { useEffect, useState } from "react";

/** Who is signed in to Distill (Studio Accounts), or signed out. `null` while it is still being asked. */
export interface Me {
  signedIn: boolean;
  name: string | null;
  role: string | null;
}

const SIGNED_OUT: Me = { signedIn: false, name: null, role: null };

export async function fetchMe(): Promise<Me> {
  try {
    const r = await fetch("/auth/me", { credentials: "same-origin" });
    if (!r.ok) return SIGNED_OUT;
    const j = await r.json();
    if (!j?.signed_in) return SIGNED_OUT;
    return { signedIn: true, name: j.user?.name ?? "Signed in", role: j.user?.role ?? null };
  } catch {
    return SIGNED_OUT;
  }
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}
