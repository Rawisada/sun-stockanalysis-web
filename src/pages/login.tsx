import { useState } from "react";
import Head from "next/head";
import styles from "@/styles/login.module.css";
import { fetchJson, setCookie } from "@/lib/api";
import { useRouter } from "next/router";

type LoginResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
  };
};


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const data = await fetchJson<LoginResponse>("/v1/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const accessToken = data.data?.access_token;
      const refreshToken = data.data?.refresh_token;
      if (!accessToken) {
        throw new Error("Missing access_token from API response");
      }

      setCookie("access_token", accessToken, data.data?.expires_in);
      if (refreshToken) {
        setCookie("refresh_token", refreshToken);
      }
      setSuccess("Login successful. Tokens saved to cookie.");
      setPassword("");
      await router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login</title>
      </Head>
      <div className={styles.page}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>
            Use your email and password to continue.
          </p>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
          {error ? (
            <p className={`${styles.message} ${styles.error}`}>{error}</p>
          ) : null}
          {success ? (
            <p className={`${styles.message} ${styles.success}`}>{success}</p>
          ) : null}
        </form>
      </div>
    </>
  );
}
