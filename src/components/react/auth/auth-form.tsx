import { type AnyFieldApi, useForm } from '@tanstack/react-form';
import { Link } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../../../core/auth/schema';
import { passwordStrength, strengthPercent } from '../../../core/auth/password';
import { GENERIC_ERROR_MESSAGE } from '../../../core/shared/errors';
import { DEFAULT_REDIRECT, isSelfRedirect, resolveRedirectTarget } from '../../../lib/redirect';
import {
  TURNSTILE_SITE_KEY,
  turnstileEnabled,
  verifyTurnstile,
} from '../../../lib/turnstile';
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
    return (
      <p className="rounded-control border border-border bg-card px-4 py-3 text-center text-sm text-muted">
        Memeriksa sesi…
      </p>
    );
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
  const [serverError, setServerError] = useState<string | null>(null);

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
      <div className="flex flex-col gap-5">
        <div
          role="status"
          className="rounded-control border border-accent/25 bg-accent-soft px-4 py-3 text-sm font-medium text-accent"
        >
          Tautan reset sudah dikirim ke <span className="font-semibold">{sent}</span>. Cek inbox
          (dan folder spam) kamu, lalu ikuti tautan di email untuk ganti kata sandi.
        </div>
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
      <div className="flex flex-col gap-5">
        <div
          role="status"
          className="rounded-control border border-accent/25 bg-accent-soft px-4 py-3 text-sm font-medium text-accent"
        >
          Kata sandi berhasil diganti. Masuk dengan kata sandi barumu ya.
        </div>
        <Button full size="lg" onClick={() => window.location.assign('/login')}>
          Masuk sekarang
        </Button>
      </div>
    );
  }

  if (!tokens.userId || !tokens.secret) {
    return (
      <div className="flex flex-col gap-5">
        <p
          role="alert"
          className="rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          Tautan reset tidak lengkap atau sudah tidak berlaku. Minta tautan baru lewat halaman lupa
          password.
        </p>
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
}: FormShellProps) {
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {serverError}
        </p>
      )}

      {fields}

      <Button type="submit" full size="lg" loading={submitting}>
        {submitLabel}
      </Button>

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
