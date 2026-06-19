const SESSION_KEY = "kaya.session";
const ONBOARDING_KEY = "kaya.onboarding";

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
const onboardingForm = document.querySelector("[data-onboarding-form]");
const onboardingSteps = document.querySelectorAll("[data-step]");
const stepBackButton = document.querySelector("[data-step-back]");
const stepNextButton = document.querySelector("[data-step-next]");
const stepCount = document.querySelector("[data-step-count]");
const stepProgress = document.querySelector("[data-step-progress]");
const logoutButtons = document.querySelectorAll("[data-logout]");

let currentStep = 0;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const authProvider = {
  async signInWithGoogle() {
    return createMockSession({
      method: "google",
      name: "Kaya Athlete",
      email: "google.user@kaya.local",
    });
  },

  async signInWithEmail(email, password) {
    return createMockSession({
      method: "email",
      email,
      passwordLength: password.length,
    });
  },

  async signUpWithEmail(name, email, password) {
    return createMockSession({
      method: "email",
      name,
      email,
      passwordLength: password.length,
      isNewUser: true,
    });
  },
};

function createMockSession(user) {
  const session = {
    user,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
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

function resolveInitialView() {
  const session = readStorage(SESSION_KEY);
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
  if (message) message.textContent = "";
}

function setAuthMessage(form, text) {
  const message = form.querySelector("[data-auth-message]");
  if (message) message.textContent = text;
}

async function continueAfterAuth() {
  localStorage.removeItem(ONBOARDING_KEY);
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

    try {
      if (mode === "signup") {
        await authProvider.signUpWithEmail(
          formData.get("name").trim(),
          formData.get("email").trim(),
          formData.get("password")
        );
      } else {
        await authProvider.signInWithEmail(
          formData.get("email").trim(),
          formData.get("password")
        );
      }

      await continueAfterAuth();
    } catch {
      setAuthMessage(form, "Something went wrong. Please try again.");
    }
  });
});

function resetGoogleButton() {
  googleButton.innerHTML = '<span class="google-mark" aria-hidden="true">G</span>Continue with Google';
}

googleButton.addEventListener("click", async () => {
  googleButton.disabled = true;
  googleButton.textContent = "Connecting...";

  try {
    await authProvider.signInWithGoogle();
    await continueAfterAuth();
  } finally {
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
  button.addEventListener("click", () => {
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

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();
renderStep(0);
resolveInitialView();
