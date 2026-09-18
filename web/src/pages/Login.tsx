import { useState, type FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button, Field, Input } from "@/components/ui";
import { Users, CalendarClock, TrendingUp } from "lucide-react";
import logo from "@/assets/brand/lm-singanallur-logo.webp";

const highlights = [
  { icon: Users, text: "Every enquiry — walk-in, call, WhatsApp or web — in one pipeline." },
  { icon: CalendarClock, text: "No lead left without a next follow-up date." },
  { icon: TrendingUp, text: "See exactly which source and campaign convert." },
];

export function Login() {
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-bg">
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden bg-accent-strong text-white flex-col justify-between p-12">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full border-[48px] border-white/[0.06]" />
        <div className="absolute -left-16 bottom-0 w-72 h-72 rounded-full border-[36px] border-white/[0.05]" />
        <div className="relative">
          <div className="inline-block bg-white rounded-2xl p-3 shadow-lg">
            <img src={logo} alt="Little Millennium Singanallur" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="font-display text-[38px] leading-[1.12] font-semibold mt-8 max-w-md">
            One place for every admissions enquiry.
          </h1>
          <p className="text-white/70 text-[15px] mt-4 max-w-sm leading-relaxed">
            From first contact to confirmed admission — track it, follow up on it, never lose it.
          </p>
        </div>
        <div className="relative space-y-4">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <h.icon className="w-4 h-4" />
              </div>
              <p className="text-[13.5px] text-white/75 leading-relaxed pt-1.5">{h.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden mb-8">
            <img src={logo} alt="Little Millennium Singanallur" className="h-14 w-auto object-contain" />
          </div>

          <h2 className="font-display text-2xl font-semibold text-ink">Sign in</h2>
          <p className="text-sm text-ink-soft mt-1.5 mb-8">Enter your staff credentials to continue.</p>

          <form onSubmit={onSubmit}>
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && (
              <div role="alert" className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2.5 text-sm text-bad mb-4">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="text-sm text-ink-faint text-center mt-5">
            New here? <Link to="/activate" className="font-semibold text-accent hover:text-accent-strong">Activate your account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
