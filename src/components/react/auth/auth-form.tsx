import { type AnyFieldApi, useForm } from '@tanstack/react-form';
import { Link } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { signInWithGoogle } from '../../../app/auth';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../../../core/auth/schema';
import { passwordStrength, strengthPercent } from '../../../core/auth/password';
import { GENERIC_ERROR_MESSAGE } from '../../../core/shared/errors';
import { DEFAULT_REDIRECT, isSelfRedirect, resolveRedirectTarget } from '../../../lib/redirect';
import { TURNSTILE_SITE_KEY, turnstileEnabled, verifyTurnstile } from '../../../lib/turnstile';
import {
  useCompleteRecovery,
  useCreateRecovery,
  useSession,
  useSignIn,
  useSignUp,
} from '../../../lib/query/hooks/use-session';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { LoadingState } from '../ui/state';
import { Turnstile } from './turnstile';

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

type Props = {
  mode: Mode;
  /** Path to return to after a successful authentication. */
  redirectTo?: string;
};

export function AuthForm({ mode, redirectTo = DEFAULT_REDIRECT }: Props) {
  const { data: session, isLoading } = useSession();

  // These pages are statically prerendered, so the `redirectTo` prop was baked
  // at build time and cannot see `?next=`. The live query string wins when it
  // is present and safe, which is what makes "sign in, land back where you
  // were" actually work.
  const [redirectTarget] = useState(() =>
    typeof window === 'undefined'
      ? redirectTo
      : resolveRedirectTarget(window.location.search, redirectTo),
  );

  useEffect(() => {
    if (isLoading || !session) return;
    goTo(redirectTarget);
  }, [isLoading, session, redirectTarget]);

  if (isLoading || session) {
    return <LoadingState label="Memeriksa sesi…" />;
  }

  return mode === 'sign-up' ? (
    <SignUpForm redirectTo={redirectTarget} />
  ) : mode === 'forgot-password' ? (
    <ForgotPasswordForm />
  ) : mode === 'reset-password' ? (
    <ResetPasswordForm />
  ) : (
    <SignInForm redirectTo={redirectTarget} />
  );
}

/**
 * Assigns to `target`, unless it is the page we are already on — following it
 * would reload this same page with the same query and redirect again, forever.
 * In that case we fall back to the dashboard rather than stalling on the
 * session-check screen.
 */
function goTo(target: string): void {
  const current = window.location.pathname;
  const resolved = isSelfRedirect(target, current) ? DEFAULT_REDIRECT : target;
  if (isSelfRedirect(resolved, current)) return;
  window.location.assign(resolved);
}

/**
 * Sign-in and sign-up are separate forms so each `useForm` is typed against the
 * exact schema it validates with — TanStack Form keys the Standard Schema
 * validator's type off the schema's input shape.
 */

/**
 * The Cloudflare Turnstile gate shared by the sign-in and sign-up forms.
 *
 * With no sitekey configured the gate is inert — no widget renders and every
 * submit proceeds, which is what keeps local work and the existing forms
 * unchanged until the feature is switched on. Once enabled, a submit must carry
 * a token that our Pages Function accepts; a rejected one stops the submit and
 * remints the widget, since a Turnstile token is single-use.
 */
function useCaptchaGate() {
  const [token, setToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const enabled = turnstileEnabled();

  const widget = enabled ? (
    <Turnstile key={nonce} siteKey={TURNSTILE_SITE_KEY} onToken={setToken} />
  ) : null;

  /** Spends the current token. Resolves `false` when the submit must stop. */
  const consume = useCallback(
    async (setServerError: (message: string | null) => void): Promise<boolean> => {
      if (!enabled) return true;
      const verdict = await verifyTurnstile(token);
      // Spend it now and mint a fresh one, whether or not this submit succeeds.
      setToken(null);
      setNonce((n) => n + 1);
      if (verdict === 'fail') {
        setServerError('Verifikasi keamanan gagal. Selesaikan kotak Turnstile, lalu coba lagi.');
        return false;
      }
      return true;
    },
    [enabled, token],
  );

  return { widget, consume };
}

function SignInForm({ redirectTo }: { redirectTo: string }) {
  const signIn = useSignIn();
  const captcha = useCaptchaGate();
  const [serverError, setServerError] = useState<string | null>(() => readOauthFailure());

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      if (!(await captcha.consume(setServerError))) return;
      try {
        await signIn.mutateAsync({ email: value.email.trim(), password: value.password });
        goTo(redirectTo);
      } catch (error) {
        setServerError(toErrorMessage(error));
      }
    },
  });

  return (
    <FormShell
      submitting={form.state.isSubmitting}
      serverError={serverError}
      submitLabel="Masuk"
      redirectTo={redirectTo}
      oauthSlot={<GoogleAuthSlot redirectTo={redirectTo} label="Masuk dengan Google" />}
      altPrompt="Belum punya akun?"
      altLabel="Daftar gratis"
      altHref="/register"
      onSubmit={() => void form.handleSubmit()}
      fields={
        <>
          <form.Field name="email">
            {(field) => (
              <AuthTextField
                field={field}
                label="Email"
                type="email"
                placeholder="kamu@email.com"
                autoComplete="email"
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <AuthTextField
                field={field}
                label="Kata sandi"
                type="password"
                placeholder="Kamu tahu jawabannya"
                autoComplete="current-password"
              />
            )}
          </form.Field>

          <p className="-mt-2 text-right text-sm">
            <a
              href="/forgot-password"
              className="font-medium text-accent underline-offset-2 hover:underline focus-ring rounded-control"
            >
              Lupa password?
            </a>
          </p>

          {captcha.widget}
        </>
      }
    />
  );
}

function SignUpForm({ redirectTo }: { redirectTo: string }) {
  const signUp = useSignUp();
  const captcha = useCaptchaGate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');

  const strength = passwordStrength(passwordValue);

  const form = useForm({
    defaultValues: { email: '', password: '', confirmPassword: '' },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      if (!(await captcha.consume(setServerError))) return;
      try {
        await signUp.mutateAsync({
          email: value.email.trim(),
          password: value.password,
        });
        goTo(redirectTo);
      } catch (error) {
        setServerError(toErrorMessage(error));
      }
    },
  });

  return (
    <FormShell
      submitting={form.state.isSubmitting}
      serverError={serverError}
      submitLabel="Buat akun"
      redirectTo={redirectTo}
      oauthSlot={<GoogleAuthSlot redirectTo={redirectTo} label="Daftar dengan Google" />}
      altPrompt="Sudah punya akun?"
      altLabel="Masuk"
      altHref="/login"
      onSubmit={() => void form.handleSubmit()}
      fields={
        <>
          <form.Field name="email">
            {(field) => (
              <AuthTextField
                field={field}
                label="Email"
                type="email"
                placeholder="kamu@email.com"
                autoComplete="email"
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <AuthTextField
                  field={field}
                  label="Kata sandi"
                  type="password"
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                  onChange={(value) => setPasswordValue(value)}
                />
                {passwordValue && (
                  <div className="flex flex-col gap-1">
                    <div
                      role="progressbar"
                      aria-valuenow={strength.score}
                      aria-valuemin={0}
                      aria-valuemax={2}
                      aria-label="Kekuatan kata sandi"
                      className="h-1.5 overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${strength.colorClass.split(' ')[0]}`}
                        style={{ width: `${strengthPercent(strength)}%` }}
                      />
                    </div>
                    <p
                      className={`text-xs font-medium transition-colors duration-300 ${strength.colorClass.split(' ')[1]}`}
                    >
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <AuthTextField
                field={field}
                label="Ulangi kata sandi"
                type="password"
                placeholder="Ketik ulang kata sandi"
                autoComplete="new-password"
              />
            )}
          </form.Field>

          {captcha.widget}
        </>
      }
    />
  );
}

/**
 * Step 1: ask for the email, send the link. The confirmation screen is shown
 * whether or not the account exists — the Appwrite layer already swallows
 * "no such user" so this form never learns the difference, which is what keeps
 * the endpoint from becoming an account-existence oracle.
 */
function ForgotPasswordForm() {
  const createRecovery = useCreateRecovery();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await createRecovery.mutateAsync(value.email.trim());
        setSent(value.email.trim());
      } catch (error) {
        setServerError(toErrorMessage(error));
      }
    },
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        <Notice variant="accent">
          Tautan reset sudah dikirim ke <span className="font-semibold">{sent}</span>. Cek inbox
          (dan folder spam) kamu, lalu ikuti tautan di email untuk ganti kata sandi.
        </Notice>
        <p className="text-center text-sm text-muted">
          <a
            href="/login"
            className="inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline focus-ring rounded-control"
          >
            Kembali ke halaman masuk
            <Link size={14} aria-hidden="true" />
          </a>
        </p>
      </div>
    );
  }

  return (
    <FormShell
      submitting={form.state.isSubmitting}
      serverError={serverError}
      submitLabel="Kirim tautan reset"
      redirectTo={DEFAULT_REDIRECT}
      altPrompt="Ingat kata sandi kamu?"
      altLabel="Masuk"
      altHref="/login"
      onSubmit={() => void form.handleSubmit()}
      fields={
        <>
          <form.Field name="email">
            {(field) => (
              <AuthTextField
                field={field}
                label="Email"
                type="email"
                placeholder="kamu@email.com"
                autoComplete="email"
                hint="Masukkan email yang kamu pakai daftar. Kami kirim tautan untuk ganti kata sandi."
              />
            )}
          </form.Field>
        </>
      }
    />
  );
}

/**
 * Step 2: reached from the emailed link, which Appwrite appends
 * `?userId=…&secret=…` to. The user only fills in the new password — the
 * tokens are read off the query string, never typed.
 */
function ResetPasswordForm() {
  const completeRecovery = useCompleteRecovery();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [tokens] = useState(() => {
    if (typeof window === 'undefined') return { userId: '', secret: '' };
    const params = new URLSearchParams(window.location.search);
    return { userId: params.get('userId') ?? '', secret: params.get('secret') ?? '' };
  });

  const form = useForm({
    defaultValues: { password: '', confirmPassword: '' },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await completeRecovery.mutateAsync({
          userId: tokens.userId,
          secret: tokens.secret,
          password: value.password,
        });
        setDone(true);
      } catch (error) {
        setServerError(toErrorMessage(error));
      }
    },
  });

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <Notice variant="accent">
          Kata sandi berhasil diganti. Masuk dengan kata sandi barumu ya.
        </Notice>
        <Button full size="lg" onClick={() => window.location.assign('/login')}>
          Masuk sekarang
        </Button>
      </div>
    );
  }

  if (!tokens.userId || !tokens.secret) {
    return (
      <div className="flex flex-col gap-6">
        <Notice variant="danger">
          Tautan reset tidak lengkap atau sudah tidak berlaku. Minta tautan baru lewat halaman lupa
          password.
        </Notice>
        <Button full size="lg" onClick={() => window.location.assign('/forgot-password')}>
          Minta tautan baru
        </Button>
      </div>
    );
  }

  return (
    <FormShell
      submitting={form.state.isSubmitting}
      serverError={serverError}
      submitLabel="Simpan kata sandi baru"
      redirectTo={DEFAULT_REDIRECT}
      altPrompt="Ingat kata sandi kamu?"
      altLabel="Masuk"
      altHref="/login"
      onSubmit={() => void form.handleSubmit()}
      fields={
        <>
          <form.Field name="password">
            {(field) => (
              <AuthTextField
                field={field}
                label="Kata sandi baru"
                type="password"
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
                hint="Minimal 8 karakter."
              />
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <AuthTextField
                field={field}
                label="Ulangi kata sandi baru"
                type="password"
                placeholder="Ketik ulang kata sandi baru"
                autoComplete="new-password"
              />
            )}
          </form.Field>
        </>
      }
    />
  );
}

type FormShellProps = {
  submitting: boolean;
  serverError: string | null;
  submitLabel: string;
  /** Preserved across the switch between sign-in and sign-up. */
  redirectTo: string;
  altPrompt: string;
  altLabel: string;
  altHref: string;
  onSubmit: () => void;
  fields: ReactNode;
  /** Optional block between the submit button and the alt link (social auth). */
  oauthSlot?: ReactNode;
};

/** Shared chrome for both auth forms: the fields carry the rest of the markup. */
function FormShell({
  submitting,
  serverError,
  submitLabel,
  redirectTo,
  altPrompt,
  altLabel,
  altHref,
  onSubmit,
  fields,
  oauthSlot,
}: FormShellProps) {
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {serverError && <Notice variant="danger">{serverError}</Notice>}

      {fields}

      <Button type="submit" full size="lg" loading={submitting}>
        {submitLabel}
      </Button>

      {oauthSlot}

      <p className="text-center text-sm text-muted">
        {altPrompt}{' '}
        <a
          href={`${altHref}?next=${encodeURIComponent(redirectTo)}`}
          className="inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline focus-ring rounded-control"
        >
          {altLabel}
          <Link size={14} aria-hidden="true" />
        </a>
      </p>
    </form>
  );
}

/**
 * Divider + Google button under the email submit on both auth forms.
 *
 * The click starts a full-page OAuth hop (`signInWithGoogle`), so the page
 * unloads before any pending state could matter — no spinner, no disabled
 * window. Google creates the account on first sign-in, which is why the same
 * slot serves both the sign-in and the sign-up form.
 */
function GoogleAuthSlot({ redirectTo, label }: { redirectTo: string; label: string }) {
  return (
    <>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span>atau</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <button
        type="button"
        onClick={() => signInWithGoogle(redirectTo)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-control border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent-soft focus-ring"
      >
        <GoogleGIcon />
        {label}
      </button>
    </>
  );
}

/** The four-colour Google mark — lucide ships no brand icons. */
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Reads the reason Appwrite dropped the user back on this page after a Google
 * round trip.
 *
 * Two very different landings produce `/login`: Appwrite's own `failure`
 * redirect (tagged `google_fail=1`, possibly with `error`/`error_description`
 * appended — Appwrite's query handling varies, so any of the three counts),
 * and a bare visit to /login, which carries neither and stays silent. The
 * session-gate bounce always arrives as `?next=…` and must NOT read as an
 * OAuth failure — that one means the round trip succeeded but the session
 * cookie did not reach the SDK.
 */
function readOauthFailure(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('google_fail') && !params.has('error')) return null;
  const detail = params.get('error_description') || params.get('error');
  const base = 'Masuk dengan Google gagal. Coba lagi, atau masuk dengan email dan kata sandi.';
  return detail ? `${base} (${detail})` : base;
}

function toErrorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: string }).message)
    : GENERIC_ERROR_MESSAGE;
}

type TextFieldProps = {
  field: AnyFieldApi;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  /** Called on every keystroke with the raw input value (before form state). */
  onChange?: (value: string) => void;
};

function AuthTextField({
  field,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  hint,
  onChange,
}: TextFieldProps) {
  const { id, errorId } = useFieldIds();
  const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined;

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required>
      <Input
        id={id}
        name={id}
        type={type}
        value={field.state.value ?? ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        invalid={Boolean(error)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          field.handleChange(event.target.value);
          onChange?.(event.target.value);
        }}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  );
}
