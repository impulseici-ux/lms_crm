import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Input } from "@/components/ui";
import { verifyActivationCode, setNewPassword } from "@/lib/data/onboarding";
import { CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";
import logo from "@/assets/brand/lm-singanallur-logo.webp";

type Step = "code" | "password" | "success";

/**
 * Public route — reached with no Firebase session (Part 6/10: verifying the
 * code must never itself grant CRM access). Three steps in one guided flow,
 * matching NewLead's pattern elsewhere in this app: verify the WhatsApp
 * code, then — and only then — let the user set their own password. Moving
 * to "password" here is purely a UI convenience; the backend independently
 * re-checks the account's real status before allowing either step, so this
 * screen can't be tricked into skipping ahead.
 */
export function Activate() {
  const [step, setStep] = useState<Step>("code");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [uid, setUid] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await verifyActivationCode(mobile.trim(), code.trim());
      setUid(result.uid);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this code.");
    } finally {
      setBusy(false);
    }
  };

  const onSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await setNewPassword(uid, password, confirmPassword);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-2xl p-3 shadow-[var(--shadow-card)] border border-border">
            <img src={logo} alt="Little Millennium Singanallur" className="h-14 w-auto object-contain" />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-[var(--shadow-card)] p-6 sm:p-8">
          {step === "code" && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <h1 className="font-display text-xl font-semibold text-ink">Activate your account</h1>
              </div>
              <p className="text-sm text-ink-soft mb-6">Enter the mobile number and one-time code your admin shared with you.</p>
              <form onSubmit={onVerify}>
                <Field label="Mobile number">
                  <Input value={mobile} onChange={(e) => setMobile(e.target.value)} required inputMode="tel" autoFocus />
                </Field>
                <Field label="One-time activation code">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    className="tracking-[0.3em] text-center font-semibold"
                  />
                </Field>
                {error && <div role="alert" className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2.5 text-sm text-bad mb-4">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full" size="lg">
                  {busy ? "Verifying…" : "Verify & Continue"}
                </Button>
              </form>
            </>
          )}

          {step === "password" && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <KeyRound className="w-5 h-5 text-accent" />
                <h1 className="font-display text-xl font-semibold text-ink">Create your password</h1>
              </div>
              <p className="text-sm text-ink-soft mb-6">Your code was verified. Choose a password only you will know — no one else sets this for you.</p>
              <form onSubmit={onSetPassword}>
                <Field label="New password">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
                </Field>
                {error && <div role="alert" className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2.5 text-sm text-bad mb-4">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full" size="lg">
                  {busy ? "Saving…" : "Set Password & Activate Account"}
                </Button>
              </form>
            </>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-14 h-14 rounded-full bg-good-soft flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-good" />
              </div>
              <h1 className="font-display text-xl font-semibold text-ink mb-1.5">Account activated</h1>
              <p className="text-sm text-ink-soft mb-6">Your password is set and your account is now active. Sign in to get started.</p>
              <Link to="/login" className="w-full">
                <Button className="w-full" size="lg">Go to Sign in</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
