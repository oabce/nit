// login.js – Tela de seleção de perfil e autenticação

document.addEventListener('DOMContentLoaded', () => {

  const card      = document.getElementById('card');
  const formArea  = document.getElementById('form-area');
  const formIcon  = document.getElementById('form-icon');
  const formTitle = document.getElementById('form-title');
  const formSub   = document.getElementById('form-sub');
  const linkEsqueci       = document.getElementById('link-esqueci');
  const btnLoginSubmit    = document.getElementById('btn-login-submit');
  const btnRegisterSubmit = document.getElementById('btn-register-submit');
  const btnShowRegister   = document.getElementById('btn-show-register');
  const regOab            = document.getElementById('reg-oab');
  const regUsuario        = document.getElementById('reg-usuario');
  const loginIdentifier   = document.getElementById('login-identifier');

  let activeProfile = null;
  let isAnimating   = false;

  function cssVar(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  }

  // ── Configuração por perfil ───────────────────────────────────
  const PROFILES = {
    advogado: {
      icon:            '/assets/imgs/advogado.png',
      title:           'Advogado',
      sub:             'Acesso ao sistema OAB/CE',
      color:           '#be1622',
      colorDark:       '#9c121c',
      focusCls:        'field-red',
      showOab:         true,
      showUsuario:     false,
      loginField:      { name: 'oab',     placeholder: 'Número OAB', type: 'text' },
    },
    colaborador: {
      icon:            '/assets/imgs/funcionarios.png',
      title:           'Colaborador',
      sub:             'Acesso ao sistema NIT',
      color:           '#1b365d',
      colorDark:       '#142846',
      focusCls:        '',
      showOab:         false,
      showUsuario:     true,
      loginField:      { name: 'usuario', placeholder: 'Usuário',     type: 'text' },
    },
  };

  // ── Abre o formulário ─────────────────────────────────────────
  function openProfile(profile) {
    if (isAnimating) return;

    // Se já tem um perfil aberto, fecha primeiro e reabre com o novo
    if (activeProfile !== null) {
      closeProfile(() => openProfile(profile));
      return;
    }

    isAnimating   = true;
    activeProfile = profile;

    const cfg    = PROFILES[profile];
    const isLeft = profile === 'colaborador';

    // Cabeçalho e cores
    formIcon.src          = cfg.icon;
    formIcon.alt          = cfg.title;
    formTitle.textContent = cfg.title;
    formSub.textContent   = cfg.sub;
    // linkEsqueci.style.color = cfg.color;

    [btnLoginSubmit, btnRegisterSubmit].forEach(btn => {
      btn.style.background = cfg.color;
      btn.onmouseenter = () => btn.style.background = cfg.colorDark;
      btn.onmouseleave = () => btn.style.background = cfg.color;
    });
    btnShowRegister.style.borderColor = cfg.color;
    btnShowRegister.style.color       = cfg.color;

    document.querySelectorAll('#form-area .field').forEach(f => {
      f.classList.remove('field-red');
      if (cfg.focusCls) f.classList.add(cfg.focusCls);
    });

    regOab.style.display = cfg.showOab ? 'block' : 'none';
    regOab.required      = cfg.showOab;

    regUsuario.style.display = cfg.showUsuario ? 'block' : 'none';
    regUsuario.required      = cfg.showUsuario;

    loginIdentifier.name        = cfg.loginField.name;
    loginIdentifier.placeholder = cfg.loginField.placeholder;
    loginIdentifier.type        = cfg.loginField.type;

    showView('login');
    clearMsgs();
    
    card.classList.remove('expand-left');
    // card.classList.toggle('expand-left', isLeft);

    const expandedW = cssVar('--welcome-w') + cssVar('--form-w');

    gsap.set(formArea, { opacity: 0 });

    const tl = gsap.timeline({ onComplete: () => isAnimating = false });

    // 1. Card expande
    tl.to(card, {
      width: expandedW,
      duration: 0.5,
      ease: 'power4.inOut',
    });

    // 2. Formulário aparece com fade rápido
    tl.to(formArea, {
      opacity: 1,
      duration: 0.18,
      ease: 'power2.out',
    }, '-=0.05');
  }

  // ── Fecha o formulário ────────────────────────────────────────
  function closeProfile(onDone) {
    if (isAnimating) return;
    isAnimating = true;

    const tl = gsap.timeline({
      onComplete: () => {
        card.style.width = '';
        card.classList.remove('expand-left');
        activeProfile = null;
        isAnimating   = false;
        if (onDone) onDone();
      },
    });

    // 1. Formulário some com fade rápido
    tl.to(formArea, {
      opacity: 0,
      duration: 0.15,
      ease: 'power2.in',
    });

    // 2. Card recolhe
    tl.to(card, {
      width: cssVar('--welcome-w'),
      duration: 0.45,
      ease: 'power4.inOut',
    });
  }

  // ── Alterna login / cadastro ──────────────────────────────────
  function showView(view) {
    document.getElementById('form-login').classList.toggle('hidden',    view !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', view !== 'register');
  }

  function clearMsgs() {
    ['msg-login', 'msg-register'].forEach(id => {
      const el = document.getElementById(id);
      el.textContent = '';
      el.className   = 'msg';
    });
  }

  // ── Listeners ─────────────────────────────────────────────────
  document.getElementById('btn-colaborador').addEventListener('click', e => {
    e.preventDefault(); openProfile('colaborador');
  });
  document.getElementById('btn-advogado').addEventListener('click', e => {
    e.preventDefault(); openProfile('advogado');
  });
  document.getElementById('btn-back').addEventListener('click', closeProfile);
  document.getElementById('btn-show-register').addEventListener('click', () => showView('register'));
  document.getElementById('btn-show-login').addEventListener('click',    () => showView('login'));

  // ── Feedback ──────────────────────────────────────────────────
  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className   = `msg ${type}`;
  }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  }

  async function postJSON(url, data) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    return res.json();
  }

  // ── Login ─────────────────────────────────────────────────────
  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    setLoading(btnLoginSubmit, true);
    try {
      const loginPayload = { perfil: activeProfile, senha: form.senha.value };
      loginPayload[loginIdentifier.name] = loginIdentifier.value;
      const result = await postJSON('/api/auth/login', loginPayload);
      if (result.error) showMsg('msg-login', result.error, 'error');
      else showMsg('msg-login', 'Login realizado com sucesso!', 'success');
    } catch {
      showMsg('msg-login', 'Erro de conexão. Tente novamente.', 'error');
    } finally {
      setLoading(btnLoginSubmit, false);
    }
  });

  // ── Cadastro ──────────────────────────────────────────────────
  document.getElementById('form-register').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    if (form.senha.value !== form.confirmar.value) {
      showMsg('msg-register', 'As senhas não coincidem.', 'error');
      return;
    }
    setLoading(btnRegisterSubmit, true);
    try {
      const payload = {
        perfil: activeProfile,
        nome:   form.nome.value,
        cpf:    form.cpf.value,
        email:  form.email.value,
        senha:  form.senha.value,
      };
      if (activeProfile === 'advogado')    payload.oab     = form.oab.value;
      if (activeProfile === 'colaborador') payload.usuario = form.usuario.value;

      const result = await postJSON('/api/auth/register', payload);
      if (result.error) showMsg('msg-register', result.error, 'error');
      else showMsg('msg-register', 'Conta criada! Faça login para continuar.', 'success');
    } catch {
      showMsg('msg-register', 'Erro de conexão. Tente novamente.', 'error');
    } finally {
      setLoading(btnRegisterSubmit, false);
    }
  });

});
