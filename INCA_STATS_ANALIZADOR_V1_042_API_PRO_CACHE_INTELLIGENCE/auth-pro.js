(() => {
  'use strict';

  const cfg = window.INCA_ARCH || {};
  const STORAGE_KEY = 'incastats.device_id.v1';
  const SUPABASE_URL = String(cfg.supabaseUrl || '').trim();
  const SUPABASE_KEY = String(cfg.supabasePublishableKey || '').trim();

  const gate = document.getElementById('incaAuthGate');
  const form = document.getElementById('incaAuthForm');
  const emailInput = document.getElementById('incaAuthEmail');
  const passwordInput = document.getElementById('incaAuthPassword');
  const submitButton = document.getElementById('incaAuthSubmit');
  const statusBox = document.getElementById('incaAuthStatus');
  const loader = document.getElementById('incaAuthLoader');
  const passwordToggle = document.getElementById('incaAuthPasswordToggle');
  const forgotButton = document.getElementById('incaAuthForgot');
  const recoveryForm = document.getElementById('incaRecoveryForm');
  const recoveryPassword = document.getElementById('incaRecoveryPassword');
  const recoveryPassword2 = document.getElementById('incaRecoveryPassword2');
  const recoverySubmit = document.getElementById('incaRecoverySubmit');
  const recoveryBack = document.getElementById('incaRecoveryBack');
  const authTitle = document.getElementById('incaAuthTitle');
  const authIntro = document.querySelector('.inca-auth-card > p');
  const recoveryHintInUrl = /(?:[?#&])type=recovery(?:[&#]|$)/i.test(window.location.href);
  let recoveryCooldownTimer = null;
  let recoveryCooldownUntil = 0;
  const forgotDefaultLabel = forgotButton?.textContent || '¿Olvidaste tu contraseña?';

  const state = {
    client: null,
    user: null,
    profile: null,
    deviceId: null,
    deviceName: null,
    deviceCount: null,
    ready: false,
    recoveryMode: false
  };

  const originalFetch = window.fetch.bind(window);

  function setStatus(message, type = '') {
    if (!statusBox) return;
    statusBox.textContent = message || '';
    statusBox.classList.remove('error', 'success');
    if (type) statusBox.classList.add(type);
  }

  function setBusy(busy, text = 'Verificando acceso…') {
    if (submitButton) submitButton.disabled = Boolean(busy);
    if (loader) {
      loader.classList.toggle('visible', Boolean(busy));
      const label = document.getElementById('incaAuthLoaderText');
      if (label) label.textContent = text;
    }
  }

  function uuidV4() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`;
  }

  function getDeviceId() {
    let id = null;
    try { id = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
      id = uuidV4();
      try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    }
    return id;
  }

  function detectDeviceName() {
    const ua = navigator.userAgent || '';
    let os = 'Dispositivo';
    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Navegador';
    if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    return `${os} · ${browser}`;
  }

  function friendlyError(err) {
    const raw = String(err?.message || err || '').toLowerCase();
    if (/invalid login|invalid.*credentials|email.*password/.test(raw)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/.test(raw)) return 'Tu correo todavía no está confirmado.';
    if (/device|dispositivo/.test(raw) && /limit|max|2|l[ií]mite/.test(raw)) return 'Esta cuenta ya alcanzó su límite de dispositivos. Desvincula uno antes de entrar desde un equipo nuevo.';
    if (/jwt|token|session/.test(raw)) return 'Tu sesión dejó de ser válida. Inicia sesión otra vez.';
    if (/rate limit|security purposes|after \d+ seconds|too many requests/.test(raw)) return 'Supabase activó una espera temporal de seguridad para los correos de recuperación.';
    if (/password/.test(raw) && /least|characters|weak|short/.test(raw)) return 'La nueva contraseña no cumple los requisitos de seguridad.';
    if (/network|fetch|failed to fetch/.test(raw)) return 'No pudimos conectar con el servidor de acceso. Revisa tu conexión e inténtalo otra vez.';
    return 'No se pudo completar el acceso. Inténtalo nuevamente.';
  }

  function cleanRecoveryUrl() {
    try {
      const clean = `${location.origin}${location.pathname}${location.search && !/code=|token=|type=recovery/i.test(location.search) ? location.search : ''}`;
      history.replaceState({}, document.title, clean);
    } catch (_) {}
  }

  function recoveryRedirectUrl() {
    if (location.protocol === 'file:') return null;
    return `${location.origin}${location.pathname}`;
  }

  function recoveryWaitSeconds(err) {
    const msg = String(err?.message || err || '');
    const m = msg.match(/after\s+(\d+)\s+seconds?/i) || msg.match(/(\d+)\s+seconds?/i);
    if (m) return Math.max(1, Number(m[1]) || 1);
    if (Number(err?.status) === 429 || /rate limit|too many requests|security purposes/i.test(msg)) return 30;
    return 0;
  }

  function stopRecoveryCooldown() {
    if (recoveryCooldownTimer) clearInterval(recoveryCooldownTimer);
    recoveryCooldownTimer = null;
    recoveryCooldownUntil = 0;
    if (forgotButton) {
      forgotButton.disabled = false;
      forgotButton.textContent = forgotDefaultLabel;
    }
  }

  function startRecoveryCooldown(seconds, prefix = 'Reintentar en') {
    stopRecoveryCooldown();
    const total = Math.max(1, Math.ceil(Number(seconds) || 1));
    recoveryCooldownUntil = Date.now() + total * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((recoveryCooldownUntil - Date.now()) / 1000));
      if (!forgotButton) return;
      if (left <= 0) {
        stopRecoveryCooldown();
        setStatus('Ya puedes solicitar el correo de recuperación.', 'success');
        return;
      }
      forgotButton.disabled = true;
      forgotButton.textContent = `${prefix} ${left}s`;
    };
    tick();
    recoveryCooldownTimer = setInterval(tick, 250);
  }

  function showLoginMode(message = '') {
    state.recoveryMode = false;
    if (form) form.hidden = false;
    if (recoveryForm) recoveryForm.hidden = true;
    if (authTitle) authTitle.textContent = 'Bienvenido de nuevo.';
    if (authIntro) authIntro.textContent = 'Inicia sesión con la cuenta asignada para acceder al motor completo de INCA STATS ANALIZADOR.';
    if (message) setStatus(message, 'success');
  }

  function showRecoveryMode(message = 'Escribe y confirma tu nueva contraseña.') {
    state.recoveryMode = true;
    document.documentElement.classList.add('inca-auth-pending');
    document.documentElement.classList.remove('inca-authenticated');
    if (gate) gate.hidden = false;
    document.getElementById('incaPortal')?.setAttribute('aria-hidden', 'true');
    if (form) form.hidden = true;
    if (recoveryForm) recoveryForm.hidden = false;
    if (authTitle) authTitle.textContent = 'Crea tu nueva contraseña.';
    if (authIntro) authIntro.textContent = 'El enlace de recuperación fue validado. Define una contraseña nueva para tu cuenta.';
    setStatus(message);
    setTimeout(() => recoveryPassword?.focus(), 50);
  }

  async function requestPasswordReset() {
    const email = String(emailInput?.value || '').trim();
    if (!email) {
      setStatus('Escribe primero tu correo y luego pulsa “¿Olvidaste tu contraseña?”.', 'error');
      emailInput?.focus();
      return;
    }
    const redirectTo = recoveryRedirectUrl();
    if (!redirectTo) {
      setStatus('Para recuperar la contraseña abre INCA STATS ANALIZADOR con Live Server o desde Vercel, no con doble clic al archivo HTML.', 'error');
      return;
    }
    setBusy(true, 'Enviando correo de recuperación…');
    setStatus('Solicitando enlace seguro de recuperación…');
    try {
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setStatus('Correo enviado. Abre el enlace y volverás directamente a INCA STATS ANALIZADOR para crear tu nueva contraseña.', 'success');
      startRecoveryCooldown(60, 'Reenviar en');
    } catch (err) {
      const wait = recoveryWaitSeconds(err);
      if (wait > 0) {
        setStatus(`Supabase tiene activo un bloqueo temporal de seguridad. Podrás pedir el correo en ${wait} s. Esto también puede venir de un intento hecho desde el panel de Supabase.`, 'error');
        startRecoveryCooldown(wait, 'Disponible en');
      } else {
        setStatus(friendlyError(err), 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword(event) {
    event?.preventDefault();
    const p1 = String(recoveryPassword?.value || '');
    const p2 = String(recoveryPassword2?.value || '');
    if (p1.length < 6) return setStatus('Usa una contraseña de al menos 6 caracteres.', 'error');
    if (p1 !== p2) return setStatus('Las dos contraseñas no coinciden.', 'error');
    if (!state.client) return setStatus('El servicio de acceso todavía no está listo.', 'error');

    if (recoverySubmit) recoverySubmit.disabled = true;
    setBusy(true, 'Guardando nueva contraseña…');
    setStatus('Actualizando tu contraseña…');
    try {
      const { error } = await state.client.auth.updateUser({ password: p1 });
      if (error) throw error;
      await state.client.auth.signOut();
      cleanRecoveryUrl();
      if (recoveryPassword) recoveryPassword.value = '';
      if (recoveryPassword2) recoveryPassword2.value = '';
      showLoginMode('Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.');
      passwordInput?.focus();
    } catch (err) {
      setStatus(friendlyError(err), 'error');
    } finally {
      if (recoverySubmit) recoverySubmit.disabled = false;
      setBusy(false);
    }
  }

  function profileAllowed(profile) {
    if (!profile) return { ok: false, message: 'Tu cuenta no tiene un perfil de acceso activo.' };
    const status = String(profile.account_status || '').toLowerCase();
    if (status !== 'active') return { ok: false, message: 'Tu cuenta no está activa. Contacta al administrador de INCA STATS ANALIZADOR.' };
    const isAdmin = String(profile.app_role || '').toLowerCase() === 'admin' || String(profile.plan || '').toLowerCase() === 'admin';
    if (!isAdmin && profile.expires_at) {
      const expires = new Date(profile.expires_at).getTime();
      if (Number.isFinite(expires) && expires <= Date.now()) return { ok: false, message: 'Tu acceso a INCA STATS ANALIZADOR venció. Renueva tu plan para continuar.' };
    }
    return { ok: true };
  }

  async function readProfile(user) {
    const { data, error } = await state.client
      .from('profiles')
      .select('id,email,app_role,plan,account_status,max_devices,expires_at')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  }

  function rpcDenied(data) {
    if (!data || typeof data !== 'object') return null;
    const value = Array.isArray(data) ? data[0] : data;
    if (!value || typeof value !== 'object') return null;
    if (value.ok === false || value.allowed === false || value.success === false) {
      return value.message || value.error || 'Límite de dispositivos alcanzado.';
    }
    return null;
  }

  async function registerCurrentDevice(user, profile) {
    state.deviceId = getDeviceId();
    state.deviceName = detectDeviceName();

    const { data, error } = await state.client.rpc('register_device', {
      p_device_id: state.deviceId,
      p_device_name: state.deviceName,
      p_user_agent: navigator.userAgent || ''
    });
    if (error) throw error;
    const denied = rpcDenied(data);
    if (denied) throw new Error(denied);

    try {
      const { data: devices, error: devicesError } = await state.client
        .from('user_devices')
        .select('device_id,first_seen_at,last_seen_at,revoked_at')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('first_seen_at', { ascending: true });
      if (!devicesError && Array.isArray(devices)) state.deviceCount = devices.length;
    } catch (_) {}

    const max = Number(profile.max_devices) || 2;
    if (Number.isFinite(state.deviceCount) && state.deviceCount > max) throw new Error('Límite de dispositivos alcanzado.');
  }

  function installAuthenticatedFetch() {
    if (window.__INCA_AUTH_FETCH_INSTALLED__) return;
    window.__INCA_AUTH_FETCH_INSTALLED__ = true;
    window.fetch = async (input, init = {}) => {
      try {
        const requestUrl = typeof input === 'string' ? input : input?.url;
        if (requestUrl) {
          const url = new URL(requestUrl, location.href);
          if (url.origin === location.origin && /\/api\//.test(url.pathname)) {
            const { data } = await state.client.auth.getSession();
            const token = data?.session?.access_token;
            const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined) || {});
            if (token) headers.set('Authorization', `Bearer ${token}`);
            init = { ...init, headers };
          }
        }
      } catch (_) {}
      return originalFetch(input, init);
    };
  }

  function closeAccountMenu() {
    const menu = document.getElementById('incaAccountMenu');
    if (menu) menu.hidden = true;
  }

  function mountAccountControl() {
    const topbar = document.querySelector('.portal-topbar');
    if (!topbar || document.getElementById('incaAccountWrap')) return;
    const email = state.profile?.email || state.user?.email || 'Usuario';
    const role = String(state.profile?.app_role || 'user').toUpperCase();
    const plan = String(state.profile?.plan || '—').toUpperCase();
    const max = Number(state.profile?.max_devices) || 2;
    const deviceText = Number.isFinite(state.deviceCount) ? `${state.deviceCount}/${max} dispositivos activos` : `Máximo ${max} dispositivos`;

    const wrap = document.createElement('div');
    wrap.className = 'inca-account-wrap';
    wrap.id = 'incaAccountWrap';
    wrap.innerHTML = `
      <button class="inca-account-btn" id="incaAccountBtn" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="inca-account-avatar"><i class="fa-solid fa-user-shield"></i></span>
        <span class="inca-account-copy"><b>${escapeHtml(email)}</b><small>${escapeHtml(role)} · ${escapeHtml(plan)}</small></span>
        <i class="fa-solid fa-chevron-down" style="font-size:9px;color:#64748b"></i>
      </button>
      <div class="inca-account-menu" id="incaAccountMenu" hidden>
        <div class="inca-account-meta"><b>${escapeHtml(email)}</b><span>${escapeHtml(role)} · ${escapeHtml(plan)}</span></div>
        <div class="inca-account-device"><strong>${escapeHtml(state.deviceName || 'Este dispositivo')}</strong>${escapeHtml(deviceText)}</div>
        <button class="inca-account-action" id="incaAuthLogout" type="button"><i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión</button>
        <button class="inca-account-action danger" id="incaAuthUnlink" type="button"><i class="fa-solid fa-link-slash"></i> Desvincular este dispositivo</button>
      </div>`;
    const mobileButton = document.getElementById('portalMobileMenu');
    topbar.insertBefore(wrap, mobileButton || null);

    const btn = document.getElementById('incaAccountBtn');
    const menu = document.getElementById('incaAccountMenu');
    btn?.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', closeAccountMenu);
    menu?.addEventListener('click', event => event.stopPropagation());
    document.getElementById('incaAuthLogout')?.addEventListener('click', logout);
    document.getElementById('incaAuthUnlink')?.addEventListener('click', unlinkCurrentDevice);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function unlockPortal() {
    state.ready = true;
    document.documentElement.classList.remove('inca-auth-pending');
    document.documentElement.classList.add('inca-authenticated');
    if (gate) gate.hidden = true;
    document.getElementById('incaPortal')?.setAttribute('aria-hidden', 'false');
    mountAccountControl();
    window.dispatchEvent(new CustomEvent('inca:auth-ready', { detail: { user: state.user, profile: state.profile, deviceId: state.deviceId } }));
  }

  function lockPortal(message = '') {
    state.ready = false;
    document.documentElement.classList.add('inca-auth-pending');
    document.documentElement.classList.remove('inca-authenticated');
    if (gate) gate.hidden = false;
    document.getElementById('incaPortal')?.setAttribute('aria-hidden', 'true');
    if (message) setStatus(message, 'error');
  }

  async function authorizeSession(session) {
    if (!session?.user) return false;
    state.user = session.user;
    const profile = await readProfile(session.user);
    const access = profileAllowed(profile);
    if (!access.ok) {
      await state.client.auth.signOut();
      lockPortal(access.message);
      return false;
    }
    state.profile = profile;
    await registerCurrentDevice(session.user, profile);
    unlockPortal();
    return true;
  }

  async function login(event) {
    event?.preventDefault();
    const email = String(emailInput?.value || '').trim();
    const password = String(passwordInput?.value || '');
    if (!email || !password) return setStatus('Escribe tu correo y contraseña.', 'error');
    setBusy(true, 'Iniciando sesión…');
    setStatus('Comprobando tus credenciales y este dispositivo…');
    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await authorizeSession(data.session);
      if (state.ready) setStatus('Acceso autorizado.', 'success');
    } catch (err) {
      try { await state.client.auth.signOut(); } catch (_) {}
      lockPortal(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    closeAccountMenu();
    setBusy(true, 'Cerrando sesión…');
    try { await state.client.auth.signOut(); } catch (_) {}
    location.reload();
  }

  async function unlinkCurrentDevice() {
    if (!state.deviceId) return;
    const confirmed = window.confirm('¿Desvincular este dispositivo? Tendrás que iniciar sesión otra vez y este cupo quedará libre.');
    if (!confirmed) return;
    try {
      const { data, error } = await state.client.rpc('revoke_device', { p_device_id: state.deviceId });
      if (error) throw error;
      const denied = rpcDenied(data);
      if (denied) throw new Error(denied);
      await state.client.auth.signOut();
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      location.reload();
    } catch (err) {
      window.alert(friendlyError(err));
    }
  }

  async function boot() {
    if (!SUPABASE_URL || !SUPABASE_KEY || !window.supabase?.createClient) {
      lockPortal('La configuración de acceso no está disponible.');
      return;
    }
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    installAuthenticatedFetch();

    state.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        state.user = session?.user || null;
        showRecoveryMode();
        return;
      }
      if (event === 'SIGNED_OUT' && !state.recoveryMode) lockPortal('Sesión cerrada.');
      if (event === 'TOKEN_REFRESHED' && session?.user) state.user = session.user;
    });

    window.INCA_AUTH = {
      state,
      get client() { return state.client; },
      get user() { return state.user; },
      get profile() { return state.profile; },
      get deviceId() { return state.deviceId; },
      logout,
      unlinkCurrentDevice
    };

    setBusy(true, 'Verificando sesión…');
    try {
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (recoveryHintInUrl) {
        lockPortal();
        if (data?.session) {
          state.user = data.session.user;
          showRecoveryMode();
        } else {
          showRecoveryMode('Validando el enlace de recuperación…');
        }
      } else if (data?.session) {
        try {
          await authorizeSession(data.session);
        } catch (err) {
          try { await state.client.auth.signOut(); } catch (_) {}
          lockPortal(friendlyError(err));
        }
      } else {
        lockPortal();
        showLoginMode();
        setStatus('Usa la cuenta que te asignó INCA STATS ANALIZADOR.');
      }
    } catch (err) {
      lockPortal(friendlyError(err));
    } finally {
      setBusy(false);
    }

  }

  form?.addEventListener('submit', login);
  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    passwordToggle.innerHTML = `<i class="fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    passwordToggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  forgotButton?.addEventListener('click', requestPasswordReset);
  recoveryForm?.addEventListener('submit', saveNewPassword);
  recoveryBack?.addEventListener('click', async () => {
    try { await state.client?.auth.signOut(); } catch (_) {}
    cleanRecoveryUrl();
    showLoginMode();
    setStatus('Usa la cuenta que te asignó INCA STATS ANALIZADOR.');
  });

  boot();
})();
