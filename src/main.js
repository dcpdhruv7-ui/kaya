import { isSupabaseConfigured, supabase, supabaseSetupMessage } from "./supabaseClient.js";

const SESSION_KEY = "kaya.session";
const ONBOARDING_KEY = "kaya.onboarding";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

const splashScreen = document.querySelector("[data-splash]");
const splashContent = document.querySelector(".splash-content");
const splashLogo = document.querySelector("[data-splash-logo]");
const header = document.querySelector(".site-header");
const appShell = document.querySelector("[data-app-shell]");
const viewPanels = document.querySelectorAll("[data-view]");
const landingExtras = document.querySelectorAll("[data-landing-extra]");
const headerAuth = document.querySelector("[data-header-auth]");
const headerApp = document.querySelector("[data-header-app]");
const modeButtons = document.querySelectorAll("[data-auth-mode]");
const authForms = document.querySelectorAll("[data-auth-form]");
const authOpenButtons = document.querySelectorAll("[data-auth-open]");
const landingButtons = document.querySelectorAll("[data-go-landing]");
const googleButton = document.querySelector("[data-google-auth]");
const recaptchaWarning = document.querySelector("[data-recaptcha-warning]");
const onboardingForm = document.querySelector("[data-onboarding-form]");
const onboardingSteps = document.querySelectorAll("[data-step]");
const stepBackButton = document.querySelector("[data-step-back]");
const stepNextButton = document.querySelector("[data-step-next]");
const stepCount = document.querySelector("[data-step-count]");
const stepProgress = document.querySelector("[data-step-progress]");
const logoutButtons = document.querySelectorAll("[data-logout]");

let currentStep = 0;
let recaptchaScriptPromise = null;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

class SupabaseSetupError extends Error {
  constructor(message = supabaseSetupMessage) {
    super(message);
    this.name = "SupabaseSetupError";
  }
}

const authProvider = {
  async signInWithGoogle() {
    if (!isSupabaseConfigured || !supabase) {
      throw new SupabaseSetupError();
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });

    if (error) throw error;
    return { pendingRedirect: true };
  },

  async signInWithEmail(email, password) {
    if (!isSupabaseConfigured || !supabase) {
      return createLocalEmailSession({ email });
    }

    const captchaToken = await getRecaptchaToken("kaya_email_signin");
    const credentials = {
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    };

    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;

    return saveSupabaseSession(data.session);
  },

  async signUpWithEmail(name, email, password) {
    if (!isSupabaseConfigured || !supabase) {
      return createLocalEmailSession({ name, email, isNewUser: true });
    }

    const captchaToken = await getRecaptchaToken("kaya_email_signup");
    const options = {
      data: { name },
      emailRedirectTo: window.location.origin + "/auth/callback",
      ...(captchaToken ? { captchaToken } : {}),
    };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });

    if (error) throw error;
    if (!data.session) {
      return { awaitingEmailConfirmation: true };
    }

    return saveSupabaseSession(data.session, { isNewUser: true });
  },
};

function createLocalEmailSession(user) {
  const session = {
    source: "local-email",
    user: {
      id: `local-${Date.now()}`,
      method: "email",
      name: user.name || user.email.split("@")[0],
      email: user.email,
      isNewUser: Boolean(user.isNewUser),
      localOnly: true,
    },
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function saveSupabaseSession(session, flags = {}) {
  if (!session?.user) return null;

  const user = session.user;
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Kaya user";

  const normalizedSession = {
    source: "supabase",
    user: {
      id: user.id,
      method: user.app_metadata?.provider || "email",
      name,
      email: user.email,
      avatarUrl: user.user_metadata?.avatar_url || null,
      isNewUser: Boolean(flags.isNewUser),
    },
    createdAt: session.created_at
      ? new Date(session.created_at * 1000).toISOString()
      : new Date().toISOString(),
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(normalizedSession));
  return normalizedSession;
}

function getSession() {
  return readStorage(SESSION_KEY);
}

function readStorage(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function setView(view) {
  const session = getSession();
  const guardedView = !session && (view === "onboarding" || view === "dashboard") ? "auth" : view;

  if (guardedView !== view) {
    setAuthMode("signin");
  }

  view = guardedView;
  document.body.dataset.appState = view;
  appShell.dataset.currentView = view;

  viewPanels.forEach((panel) => {
    const isActive = panel.dataset.view === view;
    panel.classList.toggle("active", isActive);
    panel.toggleAttribute("hidden", !isActive);
  });

  landingExtras.forEach((panel) => {
    const isActive = view === "landing";
    panel.classList.toggle("active", isActive);
    panel.toggleAttribute("hidden", !isActive);
  });

  const isDashboard = view === "dashboard";
  headerAuth.classList.toggle("is-hidden", isDashboard);
  headerApp.classList.toggle("is-hidden", !isDashboard);
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
}

async function recoverSupabaseSession() {
  if (!isSupabaseConfigured || !supabase) return;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("Kaya Supabase session recovery failed:", error.message);
    return;
  }

  if (data.session) {
    saveSupabaseSession(data.session);
    return;
  }

  const localSession = getSession();
  if (localSession?.source === "supabase") {
    localStorage.removeItem(SESSION_KEY);
  }
}

async function handleAuthCallback() {
  if (!window.location.pathname.startsWith("/auth/callback")) return false;

  if (!isSupabaseConfigured || !supabase) {
    history.replaceState({}, "", "/");
    setAuthMode("signin");
    setView("auth");
    const activeForm = document.querySelector(".auth-form.active");
    if (activeForm) setAuthMessage(activeForm, supabaseSetupMessage, "error");
    return true;
  }

  await recoverSupabaseSession();
  history.replaceState({}, "", "/");

  if (!getSession()) {
    setAuthMode("signin");
    setView("auth");
    const activeForm = document.querySelector(".auth-form.active");
    if (activeForm) {
      setAuthMessage(activeForm, "No Supabase session was found. Start Google sign-in again.", "error");
    }
    return true;
  }

  await continueAfterAuth();
  return true;
}

function resolveInitialView() {
  const session = getSession();
  const onboarding = readStorage(ONBOARDING_KEY);

  if (!session) {
    setView("landing");
    return;
  }

  if (!onboarding) {
    setView("onboarding");
    renderStep(0);
    return;
  }

  renderDashboard(onboarding);
  setView("dashboard");
}

function setAuthMode(mode) {
  const heading = document.querySelector("[data-auth-heading]");

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });

  authForms.forEach((form) => {
    form.classList.toggle("active", form.dataset.authForm === mode);
    clearAuthMessage(form);
  });

  if (heading) {
    heading.textContent = mode === "signup" ? "Create your Kaya account" : "Welcome back";
  }
}

function openAuth(mode) {
  setAuthMode(mode);
  setView("auth");

  const firstInput = document.querySelector(".auth-form.active input");
  if (firstInput) firstInput.focus();
}

function clearAuthMessage(form) {
  const message = form.querySelector("[data-auth-message]");
  if (!message) return;

  message.textContent = "";
  message.classList.remove("is-error");
}

function setAuthMessage(form, text, tone = "success") {
  const message = form.querySelector("[data-auth-message]");
  if (!message) return;

  message.textContent = text;
  message.classList.toggle("is-error", tone === "error");
}

function showRecaptchaWarning() {
  if (!recaptchaWarning) return;

  if (RECAPTCHA_SITE_KEY) {
    recaptchaWarning.hidden = true;
    return;
  }

  recaptchaWarning.hidden = false;
  recaptchaWarning.textContent =
    "Developer warning: VITE_RECAPTCHA_SITE_KEY is missing. Email/password forms will not request a reCAPTCHA token. Google OAuth is unaffected.";
}

function loadRecaptchaScript() {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(null);
  if (window.grecaptcha?.execute) return Promise.resolve(window.grecaptcha);
  if (recaptchaScriptPromise) return recaptchaScriptPromise;

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error("Google reCAPTCHA script failed to load."));
    document.head.appendChild(script);
  });

  return recaptchaScriptPromise;
}

async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY) return null;

  const grecaptcha = await loadRecaptchaScript();
  if (!grecaptcha?.execute) {
    throw new Error("Google reCAPTCHA is configured but unavailable.");
  }

  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha
        .execute(RECAPTCHA_SITE_KEY, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}

async function continueAfterAuth() {
  const session = getSession();
  if (!session) throw new Error("Authentication did not complete.");

  if (session.user?.isNewUser) {
    localStorage.removeItem(ONBOARDING_KEY);
  }

  const onboarding = readStorage(ONBOARDING_KEY);
  if (onboarding) {
    renderDashboard(onboarding);
    setView("dashboard");
    return;
  }

  renderStep(0);
  setView("onboarding");
}

authOpenButtons.forEach((button) => {
  button.addEventListener("click", () => openAuth(button.dataset.authOpen));
});

landingButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setView("landing");
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

authForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessage(form);

    const formData = new FormData(form);
    const mode = form.dataset.authForm;
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const result =
        mode === "signup"
          ? await authProvider.signUpWithEmail(
              String(formData.get("name") || "").trim(),
              email,
              password
            )
          : await authProvider.signInWithEmail(email, password);

      if (result?.awaitingEmailConfirmation) {
        setAuthMessage(form, "Check your email to confirm the account, then sign in.");
        return;
      }

      await continueAfterAuth();
    } catch (error) {
      setAuthMessage(form, error.message || "Authentication failed. Please try again.", "error");
    }
  });
});

function resetGoogleButton() {
  googleButton.innerHTML = '<span class="google-mark" aria-hidden="true">G</span>Continue with Google';
}

googleButton.addEventListener("click", async () => {
  const activeForm = document.querySelector(".auth-form.active");
  if (activeForm) clearAuthMessage(activeForm);

  googleButton.disabled = true;
  googleButton.innerHTML = '<span class="google-mark" aria-hidden="true">G</span>Opening Google...';

  try {
    await authProvider.signInWithGoogle();
  } catch (error) {
    if (activeForm) {
      setAuthMessage(activeForm, error.message || "Google sign-in did not start.", "error");
    }
    googleButton.disabled = false;
    resetGoogleButton();
  }
});

function renderStep(step) {
  currentStep = Math.max(0, Math.min(step, onboardingSteps.length - 1));

  onboardingSteps.forEach((fieldset, index) => {
    fieldset.classList.toggle("active", index === currentStep);
  });

  stepBackButton.disabled = currentStep === 0;
  stepNextButton.textContent =
    currentStep === onboardingSteps.length - 1 ? "Enter dashboard" : "Continue";
  stepCount.textContent = `Step ${currentStep + 1} of ${onboardingSteps.length}`;
  stepProgress.style.width = `${((currentStep + 1) / onboardingSteps.length) * 100}%`;
}

function getCurrentStepFields() {
  return Array.from(onboardingSteps[currentStep].querySelectorAll("input, select"));
}

function validateCurrentStep() {
  const fields = getCurrentStepFields();
  const radioGroups = new Set();

  for (const field of fields) {
    if (field.type === "radio") {
      if (radioGroups.has(field.name)) continue;
      radioGroups.add(field.name);

      const checked = onboardingSteps[currentStep].querySelector(
        `input[name="${field.name}"]:checked`
      );

      if (!checked) return false;
      continue;
    }

    if (!field.value) {
      field.focus();
      return false;
    }
  }

  return true;
}

function collectOnboarding() {
  const formData = new FormData(onboardingForm);
  return {
    goal: formData.get("goal"),
    age: Number(formData.get("age")),
    height: Number(formData.get("height")),
    weight: Number(formData.get("weight")),
    trainingLevel: formData.get("trainingLevel"),
    workoutDays: Number(formData.get("workoutDays")),
    dietPreference: formData.get("dietPreference"),
    completedAt: new Date().toISOString(),
  };
}

onboardingForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!getSession()) {
    setView("auth");
    return;
  }

  if (!validateCurrentStep()) return;

  if (currentStep < onboardingSteps.length - 1) {
    renderStep(currentStep + 1);
    return;
  }

  const onboarding = collectOnboarding();
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(onboarding));
  renderDashboard(onboarding);
  setView("dashboard");
});

stepBackButton.addEventListener("click", () => {
  renderStep(currentStep - 1);
});

function renderDashboard(onboarding) {
  document.querySelector("[data-dashboard-goal]").textContent = onboarding.goal || "Not set";
  document.querySelector("[data-dashboard-days]").textContent =
    onboarding.workoutDays ? `${onboarding.workoutDays} days` : "0 days";
  document.querySelector("[data-dashboard-diet]").textContent =
    onboarding.dietPreference || "Not set";
  document.querySelector("[data-dashboard-level]").textContent =
    onboarding.trainingLevel ? `${onboarding.trainingLevel} training level` : "Level pending";

  const profile = [];
  if (onboarding.age) profile.push(`${onboarding.age} yrs`);
  if (onboarding.height) profile.push(`${onboarding.height} cm`);
  if (onboarding.weight) profile.push(`${onboarding.weight} kg`);
  document.querySelector("[data-dashboard-profile]").textContent =
    profile.length ? profile.join(" / ") : "Onboarding complete";
}

logoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }

    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ONBOARDING_KEY);
    onboardingForm.reset();
    renderStep(0);
    setView("landing");
  });
});

function syncHeader() {
  header.classList.toggle("scrolled", window.scrollY > 24);
}

function finishSplash() {
  if (!splashScreen || splashScreen.classList.contains("is-finished")) return;
  splashScreen.classList.add("is-finished");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function startSplash() {
  if (!splashScreen || !splashLogo) return;

  if (prefersReducedMotion || window.location.pathname.startsWith("/auth/callback")) {
    splashLogo.textContent = "KAYA";
    splashContent?.classList.add("is-hook-visible");
    window.setTimeout(finishSplash, prefersReducedMotion ? 120 : 300);
    return;
  }

  for (const text of ["K", "KA", "KAY", "KAYA"]) {
    splashLogo.classList.add("is-stepping");
    splashLogo.textContent = text;
    await wait(260);
    splashLogo.classList.remove("is-stepping");
    await wait(90);
  }

  splashContent?.classList.add("is-hook-visible");
  window.setTimeout(finishSplash, 820);
  window.setTimeout(finishSplash, 1800);
}

async function boot() {
  window.addEventListener("scroll", syncHeader, { passive: true });
  syncHeader();
  renderStep(0);
  showRecaptchaWarning();
  startSplash();

  await recoverSupabaseSession();
  const handledCallback = await handleAuthCallback();
  if (!handledCallback) resolveInitialView();
}

boot();
