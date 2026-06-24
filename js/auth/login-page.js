// ============================================================
// LOGIN PAGE CONTROLLER
// ============================================================
import { login, getCurrentProfile } from './auth.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

/** If already logged in, skip straight to the dashboard. */
(async function redirectIfLoggedIn() {
  const profile = await getCurrentProfile();
  if (profile) {
    window.location.href = 'dashboard.html';
  }
})();

function setFieldError(fieldId, hasError) {
  document.getElementById(fieldId).classList.toggle('has-error', hasError);
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.classList.add('is-visible');
}

function clearLoginError() {
  loginError.classList.remove('is-visible');
}

function validate() {
  let valid = true;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim());
  setFieldError('emailField', !emailValid);
  if (!emailValid) valid = false;

  const passwordValid = passwordInput.value.length > 0;
  setFieldError('passwordField', !passwordValid);
  if (!passwordValid) valid = false;

  return valid;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearLoginError();

  if (!validate()) return;

  loginBtn.classList.add('is-loading');
  loginBtn.disabled = true;

  try {
    await login(emailInput.value.trim(), passwordInput.value);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showLoginError(err.message || 'Something went wrong. Try again.');
    loginBtn.classList.remove('is-loading');
    loginBtn.disabled = false;
  }
});

// Clear field-level error state as the user types
[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => {
    input.closest('.field').classList.remove('has-error');
    clearLoginError();
  });
});
