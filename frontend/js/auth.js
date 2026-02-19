const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const toast = document.getElementById('toast');

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active'); signupTab.classList.remove('active');
  loginForm.style.display = 'block'; signupForm.style.display = 'none';
});
signupTab.addEventListener('click', () => {
  signupTab.classList.add('active'); loginTab.classList.remove('active');
  signupForm.style.display = 'block'; loginForm.style.display = 'none';
});
document.getElementById('gotoLogin').addEventListener('click', (e) => {
  e.preventDefault();
  loginTab.click();
});

function showToast(msg, ok=true) {
  toast.textContent = msg;
  toast.style.background = ok ? '#e7f7eb' : '#fde0e0';
  toast.style.color = ok ? '#1a7a4e' : '#c45555';
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2500);
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character.';
  return null;
}

function toggleVisibility(triggerId, inputId) {
  const trig = document.getElementById(triggerId);
  const input = document.getElementById(inputId);
  trig.addEventListener('click', () => {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
  });
}
toggleVisibility('toggleLoginPass', 'loginPassword');
toggleVisibility('toggleSupass1', 'suPass');
toggleVisibility('toggleSupass2', 'suPass2');

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  try {
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    const data = await postJSON('/api/auth/login', { identifier, password });
    showToast('Login successful!');
    setTimeout(() => window.location.href = '/home.html', 800);
  } catch (err) {
    showToast(err.message, false);
  }
});

document.getElementById('signupBtn').addEventListener('click', async () => {
  const name = document.getElementById('suName').value.trim();
  const username = document.getElementById('suUsername').value.trim();
  const email = document.getElementById('suEmail').value.trim();
  const password = document.getElementById('suPass').value;
  const password2 = document.getElementById('suPass2').value;
  const agree = document.getElementById('suAgree').checked;
  if (password !== password2) return showToast('Passwords do not match', false);
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return showToast(passwordError, false);
  try {
    await postJSON('/api/auth/register', { name, username, email, password, agree });
    showToast('Account created! Please log in.');
    // prefill login identifier to help the user
    document.getElementById('loginIdentifier').value = username || email;
    loginTab.click();
  } catch (err) {
    showToast(err.message, false);
  }
});

document.getElementById('forgotLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = prompt('Enter your account email for password reset:');
  if (!email) return;
  try {
    await postJSON('/api/auth/forgot-password', { email: email.trim() });
    showToast('If your email exists, a reset link has been sent.');
  } catch (err) {
    showToast(err.message, false);
  }
});

async function checkResetTokenFlow() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reset_token');
  const email = params.get('email');
  if (!token || !email) return;

  const newPassword = prompt(`Reset password for ${email}\nEnter new password:`);
  if (!newPassword) return;
  const confirmPassword = prompt('Confirm new password:');
  if (newPassword !== confirmPassword) return showToast('Passwords do not match', false);

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return showToast(passwordError, false);

  try {
    await postJSON('/api/auth/reset-password', { email, token, newPassword });
    showToast('Password reset successful. Please log in.');
    params.delete('reset_token');
    params.delete('email');
    const clean = params.toString();
    const cleanUrl = clean ? `${window.location.pathname}?${clean}` : window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (err) {
    showToast(err.message, false);
  }
}

// auto redirect if already logged in
fetch('/api/auth/me', { credentials: 'include' }).then(r => {
  if (r.ok) window.location.href = '/home.html';
});

checkResetTokenFlow();
