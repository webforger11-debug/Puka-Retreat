import { login, redirectToDashboardIfAuthenticated } from "./auth.js";

redirectToDashboardIfAuthenticated();

const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const errorText = document.getElementById("loginError");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = usernameInput.value;
  const password = passwordInput.value;

  const success = login(username, password);

  if (!success) {
    errorText.textContent = "Invalid credentials. Please try again.";
    passwordInput.value = "";
    passwordInput.focus();
    return;
  }

  errorText.textContent = "";
  window.location.href = "dashboard.html";
});
