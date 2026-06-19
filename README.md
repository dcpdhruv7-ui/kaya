# Kaya

Premium workout tracking app prototype.

Live site: https://kaya-fitness-tracker-dhruv.netlify.app

## Local development

```bash
pnpm install
pnpm dev
```

## Required environment variables

Create `.env.local` for local development and add the same variables in Netlify
under Site configuration > Environment variables.

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_RECAPTCHA_SITE_KEY=your_google_recaptcha_site_key
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for real Google
OAuth. Without them, the Google button shows a setup error and does not create a
local Google session.

Email/password can run locally without Supabase while the backend is being set
up. When Supabase is configured, email/password uses Supabase Auth.

## Supabase Google OAuth setup

1. Create a Supabase project.
2. Copy the Project URL and anon public key into `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
3. In Supabase, open Authentication > Providers and enable Google.
4. In Google Cloud Console, create OAuth 2.0 credentials for a Web application.
5. Add the Supabase callback URL shown in the Supabase Google provider settings
   to Google Cloud as an authorized redirect URI.
6. Add these Supabase Authentication > URL Configuration redirect URLs:

```text
http://127.0.0.1:5173/auth/callback
http://localhost:5173/auth/callback
https://kaya-fitness-tracker-dhruv.netlify.app/auth/callback
```

The app starts OAuth with:

```js
supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: window.location.origin + "/auth/callback",
  },
});
```

## Netlify setup

The site builds with Vite:

```bash
pnpm build
```

Netlify should use:

```text
Build command: pnpm build
Publish directory: dist
```

Add these Netlify environment variables before testing production OAuth:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_RECAPTCHA_SITE_KEY
```

## reCAPTCHA setup

Kaya requests Google reCAPTCHA only for email/password sign in and sign up. It
does not run reCAPTCHA before Google OAuth.

1. Create a Google reCAPTCHA v3 site.
2. Add the local and Netlify domains to the allowed domains:

```text
127.0.0.1
localhost
kaya-fitness-tracker-dhruv.netlify.app
```

3. Put the site key in `VITE_RECAPTCHA_SITE_KEY`.
4. Verify the reCAPTCHA token server-side before relying on it for production
   email/password protection. Supabase's built-in Bot and Abuse Protection
   currently documents hCaptcha and Cloudflare Turnstile support; if you use
   Supabase built-in CAPTCHA instead, configure the provider and secret key in
   Supabase Authentication > Bot and Abuse Protection and keep passing a
   `captchaToken` from the client.
