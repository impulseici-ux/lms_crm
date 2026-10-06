import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Role, UserDoc } from "@/types";

interface AuthState {
  user: User | null;
  role: Role | null;
  profile: UserDoc | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-pulls the ID token (bypassing its normal ~1hr cache) and updates `role` from its
   * claims — needed after a server-side role change (e.g. the role switcher) that a plain
   * page reload would also pick up, but without forcing one. */
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const token = await firebaseUser.getIdTokenResult(true);
      setRole((token.claims.role as Role) ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<UserDoc, "id">) }) : null);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      profile,
      loading,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signOut: () => firebaseSignOut(auth),
      refreshRole: async () => {
        if (!auth.currentUser) return;
        const token = await auth.currentUser.getIdTokenResult(true);
        setRole((token.claims.role as Role) ?? null);
      },
    }),
    [user, role, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
