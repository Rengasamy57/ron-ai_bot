/**
 * Ron AI — Authentication JavaScript
 * Handles Signup, Login, JWT token storage, client validation, and redirection.
 */

// Global Auth Utilities
window.RonAuth = {
    TOKEN_KEY: 'ron_ai_access_token',
    USER_KEY: 'ron_ai_user',

    getAccessToken() {
        return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
    },

    setAccessToken(token, user, remember = true) {
        if (remember) {
            localStorage.setItem(this.TOKEN_KEY, token);
            if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            sessionStorage.removeItem(this.TOKEN_KEY);
            sessionStorage.removeItem(this.USER_KEY);
        } else {
            sessionStorage.setItem(this.TOKEN_KEY, token);
            if (user) sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
        }
    },

    getUser() {
        const uStr = localStorage.getItem(this.USER_KEY) || sessionStorage.getItem(this.USER_KEY);
        try {
            return uStr ? JSON.parse(uStr) : null;
        } catch {
            return null;
        }
    },

    clearAccessToken() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.removeItem(this.USER_KEY);
    },

    isAuthenticated() {
        return !!this.getAccessToken();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:8000/api/auth'
        : '/api/auth';

    // Password show/hide toggle buttons
    const togglePwdBtns = document.querySelectorAll('.btn-toggle-pwd');
    togglePwdBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');

            if (targetInput.type === 'password') {
                targetInput.type = 'text';
                eyeOpen.classList.add('hidden');
                eyeClosed.classList.remove('hidden');
            } else {
                targetInput.type = 'password';
                eyeOpen.classList.remove('hidden');
                eyeClosed.classList.add('hidden');
            }
        });
    });

    // Helpers for inline validation & alerts
    function setFieldError(fieldId, message) {
        const group = document.getElementById('group-' + fieldId);
        const errorEl = document.getElementById('error-' + fieldId);
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
    }

    function clearFieldError(fieldId) {
        const group = document.getElementById('group-' + fieldId);
        const errorEl = document.getElementById('error-' + fieldId);
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    function showAlert(alertEl, textEl, type, message) {
        if (!alertEl || !textEl) return;
        alertEl.className = 'form-alert alert-' + type;
        textEl.textContent = message;
        alertEl.classList.remove('hidden');
    }

    function hideAlert(alertEl) {
        if (alertEl) alertEl.classList.add('hidden');
    }

    // ==========================================
    // 1. SIGNUP FORM LOGIC
    // ==========================================
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        const fullNameInput = document.getElementById('fullName');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const termsAgreeInput = document.getElementById('termsAgree');

        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnArrow = submitBtn.querySelector('.btn-arrow');
        const btnSpinner = document.getElementById('btnSpinner');
        const formAlert = document.getElementById('formAlert');
        const alertText = document.getElementById('alertText');

        // Real-time error clearing
        [fullNameInput, emailInput, passwordInput, confirmPasswordInput].forEach(inp => {
            inp.addEventListener('input', () => {
                clearFieldError(inp.id);
                hideAlert(formAlert);
            });
        });

        if (termsAgreeInput) {
            termsAgreeInput.addEventListener('change', () => clearFieldError('terms'));
        }

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            ['fullName', 'email', 'password', 'confirmPassword', 'terms'].forEach(clearFieldError);
            hideAlert(formAlert);

            let isValid = true;
            const nameVal = fullNameInput.value.trim();
            const emailVal = emailInput.value.trim();
            const pwdVal = passwordInput.value;
            const confirmVal = confirmPasswordInput.value;
            const termsVal = termsAgreeInput ? termsAgreeInput.checked : true;

            if (!nameVal) {
                setFieldError('fullName', 'Please enter your full name.');
                isValid = false;
            } else if (nameVal.length < 2) {
                setFieldError('fullName', 'Full name must be at least 2 characters.');
                isValid = false;
            }

            const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
            if (!emailVal) {
                setFieldError('email', 'Please enter your email address.');
                isValid = false;
            } else if (!emailRegex.test(emailVal)) {
                setFieldError('email', 'Please enter a valid email address.');
                isValid = false;
            }

            if (!pwdVal) {
                setFieldError('password', 'Please enter a password.');
                isValid = false;
            } else if (pwdVal.length < 8) {
                setFieldError('password', 'Password must be at least 8 characters long.');
                isValid = false;
            }

            if (!confirmVal) {
                setFieldError('confirmPassword', 'Please confirm your password.');
                isValid = false;
            } else if (confirmVal !== pwdVal) {
                setFieldError('confirmPassword', 'Passwords do not match.');
                isValid = false;
            }

            if (!termsVal) {
                setFieldError('terms', 'You must agree to the Terms and Privacy Policy.');
                isValid = false;
            }

            if (!isValid) return;

            // Submit
            submitBtn.disabled = true;
            btnText.textContent = 'Creating Account...';
            btnArrow.classList.add('hidden');
            btnSpinner.classList.remove('hidden');

            try {
                const res = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ name: nameVal, email: emailVal.toLowerCase(), password: pwdVal })
                });

                const data = await res.json().catch(() => ({}));

                if (res.status === 201) {
                    showAlert(formAlert, alertText, 'success', 'Account created successfully! Redirecting to sign in...');
                    btnText.textContent = 'Success ✓';
                    btnSpinner.classList.add('hidden');
                    submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

                    setTimeout(() => {
                        window.location.href = 'login.html?registered=true&email=' + encodeURIComponent(emailVal);
                    }, 1400);
                } else if (res.status === 409) {
                    setFieldError('email', 'An account with this email already exists.');
                    showAlert(formAlert, alertText, 'error', data.detail || 'An account with this email already exists.');
                    emailInput.focus();
                } else if (res.status === 422) {
                    const msg = Array.isArray(data.detail) && data.detail.length > 0 ? data.detail[0].msg : 'Please check your inputs.';
                    showAlert(formAlert, alertText, 'error', msg);
                } else {
                    showAlert(formAlert, alertText, 'error', data.detail || 'An unexpected error occurred. Please try again.');
                }
            } catch (err) {
                console.error('Signup error:', err);
                showAlert(formAlert, alertText, 'error', 'Unable to connect to server. Please ensure the backend is running.');
            } finally {
                if (!btnText.textContent.includes('Success')) {
                    submitBtn.disabled = false;
                    btnText.textContent = 'Create Account';
                    btnArrow.classList.remove('hidden');
                    btnSpinner.classList.add('hidden');
                }
            }
        });
    }

    // ==========================================
    // 2. LOGIN FORM LOGIC
    // ==========================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const loginEmailInput = document.getElementById('loginEmail');
        const loginPasswordInput = document.getElementById('loginPassword');
        const rememberMeInput = document.getElementById('rememberMe');

        const loginSubmitBtn = document.getElementById('loginSubmitBtn');
        const loginBtnText = loginSubmitBtn.querySelector('.btn-text');
        const loginBtnArrow = loginSubmitBtn.querySelector('.btn-arrow');
        const loginSpinner = document.getElementById('loginSpinner');
        const loginAlert = document.getElementById('loginAlert');
        const loginAlertText = document.getElementById('loginAlertText');

        // Check URL params if redirected after registration
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('registered') === 'true') {
            const regEmail = urlParams.get('email');
            if (regEmail) loginEmailInput.value = regEmail;
            showAlert(loginAlert, loginAlertText, 'success', 'Account created! Please sign in with your credentials.');
        }

        // Real-time clearing
        [loginEmailInput, loginPasswordInput].forEach(inp => {
            inp.addEventListener('input', () => {
                clearFieldError(inp.id);
                hideAlert(loginAlert);
            });
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            ['loginEmail', 'loginPassword'].forEach(clearFieldError);
            hideAlert(loginAlert);

            let isValid = true;
            const emailVal = loginEmailInput.value.trim();
            const pwdVal = loginPasswordInput.value;
            const rememberVal = rememberMeInput ? rememberMeInput.checked : true;

            const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
            if (!emailVal) {
                setFieldError('loginEmail', 'Please enter your email address.');
                isValid = false;
            } else if (!emailRegex.test(emailVal)) {
                setFieldError('loginEmail', 'Please enter a valid email address.');
                isValid = false;
            }

            if (!pwdVal) {
                setFieldError('loginPassword', 'Please enter your password.');
                isValid = false;
            } else if (pwdVal.length < 8) {
                setFieldError('loginPassword', 'Password must be at least 8 characters.');
                isValid = false;
            }

            if (!isValid) return;

            // Submit
            loginSubmitBtn.disabled = true;
            loginBtnText.textContent = 'Signing In...';
            loginBtnArrow.classList.add('hidden');
            loginSpinner.classList.remove('hidden');

            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ email: emailVal.toLowerCase(), password: pwdVal })
                });

                const data = await res.json().catch(() => ({}));

                if (res.status === 200 && data.access_token) {
                    // Store token & user
                    window.RonAuth.setAccessToken(data.access_token, data.user, rememberVal);

                    showAlert(loginAlert, loginAlertText, 'success', 'Signed in successfully! Redirecting...');
                    loginBtnText.textContent = 'Success ✓';
                    loginSpinner.classList.add('hidden');
                    loginSubmitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

                    // Redirect to chat placeholder
                    setTimeout(() => {
                        window.location.href = 'chat.html';
                    }, 1200);

                } else if (res.status === 401) {
                    showAlert(loginAlert, loginAlertText, 'error', data.detail || 'Invalid email or password.');
                    loginPasswordInput.focus();
                } else if (res.status === 422) {
                    const msg = Array.isArray(data.detail) && data.detail.length > 0 ? data.detail[0].msg : 'Invalid email or password format.';
                    showAlert(loginAlert, loginAlertText, 'error', msg);
                } else {
                    showAlert(loginAlert, loginAlertText, 'error', data.detail || 'An unexpected error occurred. Please try again.');
                }
            } catch (err) {
                console.error('Login error:', err);
                showAlert(loginAlert, loginAlertText, 'error', 'Unable to connect to server. Please check your network or ensure backend is running.');
            } finally {
                if (!loginBtnText.textContent.includes('Success')) {
                    loginSubmitBtn.disabled = false;
                    loginBtnText.textContent = 'Sign In';
                    loginBtnArrow.classList.remove('hidden');
                    loginSpinner.classList.add('hidden');
                }
            }
        });
    }

    console.log('Ron AI Auth System initialized.');
});
