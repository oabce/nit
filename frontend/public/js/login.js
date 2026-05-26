// Login screen profile selection and auth flow.

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = ['127.0.0.1', 'localhost'].includes(window.location.hostname) && window.location.port !== '3000'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : '';
  const card = document.getElementById('card');
  const formArea = document.getElementById('form-area');
  const formIcon = document.getElementById('form-icon');
  const formTitle = document.getElementById('form-title');
  const formSub = document.getElementById('form-sub');
  const btnLoginSubmit = document.getElementById('btn-login-submit');
  const btnRegisterSubmit = document.getElementById('btn-register-submit');
  const btnRecoverSubmit = document.getElementById('btn-recover-submit');
  const btnStatusSubmit = document.getElementById('btn-status-submit');
  const btnShowRegister = document.getElementById('btn-show-register');
  const btnShowStatus = document.getElementById('btn-show-status');
  const btnShowLogin = document.getElementById('btn-show-login');
  const btnShowLoginFromRecover = document.getElementById('btn-show-login-from-recover');
  const btnShowLoginFromStatus = document.getElementById('btn-show-login-from-status');
  const linkEsqueci = document.getElementById('link-esqueci');
  const regOab = document.getElementById('reg-oab');
  const regUsuario = document.getElementById('reg-usuario');
  const loginIdentifier = document.getElementById('login-identifier');
  const recoverEmail = document.getElementById('recover-email');
  const statusEmail = document.getElementById('status-email');
  const statusCpf = document.getElementById('status-cpf');
  const statusResult = document.getElementById('status-result');
  const statusBadge = document.getElementById('status-badge');
  const statusName = document.getElementById('status-name');
  const statusDetail = document.getElementById('status-detail');
  const statusGuidance = document.getElementById('status-guidance');
  const mobileQuery = window.matchMedia('(max-width: 767px)');

  let activeProfile = null;
  let isAnimating = false;

  function cssVar(name) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  }

  function isMobileLayout() {
    return mobileQuery.matches;
  }

  function syncLayoutState() {
    gsap.killTweensOf([card, formArea]);

    if (activeProfile === null) {
      card.style.width = '';
      card.classList.remove('expand-left');
      gsap.set(formArea, {
        display: 'none',
        opacity: 0,
        height: isMobileLayout() ? 0 : 'auto',
      });
      return;
    }

    card.classList.remove('expand-left');
    gsap.set(formArea, {
      display: 'flex',
      opacity: 1,
      height: 'auto',
    });

    if (isMobileLayout()) {
      card.style.width = '';
    } else {
      card.style.width = `${cssVar('--welcome-w') + cssVar('--form-w')}px`;
    }
  }

  const PROFILES = {
    advogado: {
      icon: 'assets/imgs/advogado.png',
      title: 'Advogado',
      sub: 'Acesso ao sistema OAB/CE',
      color: '#be1622',
      colorDark: '#9c121c',
      focusCls: 'field-red',
      showOab: true,
      showUsuario: false,
      loginField: { name: 'oab', placeholder: 'N\u00FAmero OAB', type: 'text' },
    },
    colaborador: {
      icon: 'assets/imgs/funcionarios.png',
      title: 'Colaborador',
      sub: 'Acesso ao sistema NIT',
      color: '#1b365d',
      colorDark: '#142846',
      focusCls: '',
      showOab: false,
      showUsuario: true,
      loginField: { name: 'usuario', placeholder: 'Usu\u00E1rio', type: 'text' },
    },
  };

  function openProfile(profile) {
    if (isAnimating) return;

    if (activeProfile !== null) {
      closeProfile(() => openProfile(profile));
      return;
    }

    isAnimating = true;
    activeProfile = profile;

    const cfg = PROFILES[profile];

    formIcon.src = cfg.icon;
    formIcon.alt = cfg.title;
    formTitle.textContent = cfg.title;
    formSub.textContent = cfg.sub;

    [btnLoginSubmit, btnRegisterSubmit, btnRecoverSubmit, btnStatusSubmit].forEach((btn) => {
      btn.style.background = cfg.color;
      btn.onmouseenter = () => {
        btn.style.background = cfg.colorDark;
      };
      btn.onmouseleave = () => {
        btn.style.background = cfg.color;
      };
    });

    btnShowRegister.style.borderColor = cfg.color;
    btnShowRegister.style.color = cfg.color;

    document.querySelectorAll('#form-area .field').forEach((field) => {
      field.classList.remove('field-red');
      if (cfg.focusCls) field.classList.add(cfg.focusCls);
    });

    regOab.style.display = cfg.showOab ? 'block' : 'none';
    regOab.required = cfg.showOab;

    regUsuario.style.display = cfg.showUsuario ? 'block' : 'none';
    regUsuario.required = cfg.showUsuario;

    loginIdentifier.name = cfg.loginField.name;
    loginIdentifier.placeholder = cfg.loginField.placeholder;
    loginIdentifier.type = cfg.loginField.type;

    showView('login');
    clearMsgs();

    card.classList.remove('expand-left');
    gsap.killTweensOf([card, formArea]);

    if (isMobileLayout()) {
      gsap.set(formArea, {
        display: 'flex',
        height: 'auto',
        opacity: 1,
      });
      isAnimating = false;
      return;
    }

    const expandedWidth = cssVar('--welcome-w') + cssVar('--form-w');

    gsap.set(formArea, {
      display: 'flex',
      height: 'auto',
      opacity: 0,
    });

    const tl = gsap.timeline({
      onComplete: () => {
        isAnimating = false;
      },
    });

    tl.to(card, {
      width: expandedWidth,
      duration: 0.5,
      ease: 'power4.inOut',
    });

    tl.to(
      formArea,
      {
        opacity: 1,
        duration: 0.18,
        ease: 'power2.out',
      },
      '-=0.05',
    );
  }

  function closeProfile(onDone) {
    if (isAnimating) return;
    isAnimating = true;
    gsap.killTweensOf([card, formArea]);

    const finalizeClose = () => {
      card.style.width = '';
      card.classList.remove('expand-left');
      activeProfile = null;
      isAnimating = false;
      gsap.set(formArea, {
        display: 'none',
        opacity: 0,
        height: isMobileLayout() ? 0 : 'auto',
      });
      if (onDone) onDone();
    };

    if (isMobileLayout()) {
      gsap.set(formArea, {
        display: 'none',
        opacity: 0,
        height: 0,
      });
      finalizeClose();
      return;
    }

    const tl = gsap.timeline({ onComplete: finalizeClose });

    tl.to(formArea, {
      opacity: 0,
      duration: 0.15,
      ease: 'power2.in',
    });

    tl.to(card, {
      width: cssVar('--welcome-w'),
      duration: 0.45,
      ease: 'power4.inOut',
    });
  }

  function showView(view) {
    document.getElementById('form-login').classList.toggle('hidden', view !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', view !== 'register');
    document.getElementById('form-recover').classList.toggle('hidden', view !== 'recover');
    document.getElementById('form-status').classList.toggle('hidden', view !== 'status');
  }

  function clearMsgs() {
    ['msg-login', 'msg-register', 'msg-recover', 'msg-status'].forEach((id) => {
      const el = document.getElementById(id);
      el.textContent = '';
      el.className = 'msg';
    });
  }

  function resetStatusResult() {
    statusResult.classList.add('hidden');
    statusBadge.textContent = '';
    statusBadge.className = 'mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold';
    statusName.textContent = '';
    statusDetail.textContent = '';
    statusGuidance.textContent = '';
  }

  function renderStatusResult(solicitacao) {
    const badgeMap = {
      pendente: 'bg-amber-100 text-amber-700',
      aprovado: 'bg-emerald-100 text-emerald-700',
      recusado: 'bg-rose-100 text-rose-700',
      desativado: 'bg-slate-200 text-slate-700',
    };

    const labelMap = {
      pendente: 'Em revisao',
      aprovado: 'Aprovada',
      recusado: 'Recusada',
      desativado: 'Desativada',
    };

    statusBadge.textContent = labelMap[solicitacao.status] || 'Sem status';
    statusBadge.className = `mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${badgeMap[solicitacao.status] || 'bg-slate-100 text-slate-700'}`;
    statusName.textContent = solicitacao.nome || 'Solicitacao encontrada';
    statusDetail.textContent = `Perfil: ${solicitacao.perfil} | Atualizado em: ${new Date(solicitacao.atualizadoEm).toLocaleString('pt-BR')}`;
    statusGuidance.textContent = solicitacao.orientacao || '';
    statusResult.classList.remove('hidden');
  }

  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `msg ${type}`;
  }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  }

  async function postJSON(url, data) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  document.getElementById('btn-colaborador').addEventListener('click', (e) => {
    e.preventDefault();
    openProfile('colaborador');
  });

  document.getElementById('btn-advogado').addEventListener('click', (e) => {
    e.preventDefault();
    openProfile('advogado');
  });

  document.getElementById('btn-back').addEventListener('click', closeProfile);
  document.getElementById('btn-show-register').addEventListener('click', () => showView('register'));
  btnShowStatus.addEventListener('click', () => {
    statusEmail.value = '';
    statusCpf.value = '';
    clearMsgs();
    resetStatusResult();
    showView('status');
  });
  btnShowLogin.addEventListener('click', () => showView('login'));
  btnShowLoginFromRecover.addEventListener('click', () => showView('login'));
  btnShowLoginFromStatus.addEventListener('click', () => showView('login'));
  linkEsqueci.addEventListener('click', (e) => {
    e.preventDefault();
    recoverEmail.value = '';
    clearMsgs();
    showView('recover');
  });

  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', syncLayoutState);
  else mobileQuery.addListener(syncLayoutState);

  document.getElementById('form-login').addEventListener('submit', async (e) => {
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
      showMsg('msg-login', 'Erro de conex\u00E3o. Tente novamente.', 'error');
    } finally {
      setLoading(btnLoginSubmit, false);
    }
  });

  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;

    if (form.senha.value !== form.confirmar.value) {
      showMsg('msg-register', 'As senhas n\u00E3o coincidem.', 'error');
      return;
    }

    setLoading(btnRegisterSubmit, true);

    try {
      const payload = {
        perfil: activeProfile,
        nome: form.nome.value,
        cpf: form.cpf.value,
        email: form.email.value,
        senha: form.senha.value,
      };

      if (activeProfile === 'advogado') payload.oab = form.oab.value;
      if (activeProfile === 'colaborador') payload.usuario = form.usuario.value;

      const result = await postJSON('/api/auth/register', payload);
      if (result.error) showMsg('msg-register', result.error, 'error');
      else showMsg('msg-register', result.message || 'Solicitacao enviada com sucesso. Aguarde a aprovacao do administrador.', 'success');
    } catch {
      showMsg('msg-register', 'Erro de conex\u00E3o. Tente novamente.', 'error');
    } finally {
      setLoading(btnRegisterSubmit, false);
    }
  });

  document.getElementById('form-recover').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(btnRecoverSubmit, true);

    try {
      const result = await postJSON('/api/auth/forgot-password', {
        perfil: activeProfile,
        email: form.email.value,
      });

      if (result.error) showMsg('msg-recover', result.error, 'error');
      else showMsg('msg-recover', result.message || 'Solicitacao recebida com sucesso.', 'success');
    } catch {
      showMsg('msg-recover', 'Erro de conex\u00E3o. Tente novamente.', 'error');
    } finally {
      setLoading(btnRecoverSubmit, false);
    }
  });

  document.getElementById('form-status').addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(btnStatusSubmit, true);
    clearMsgs();
    resetStatusResult();

    try {
      const result = await postJSON('/api/auth/request-status', {
        perfil: activeProfile,
        email: statusEmail.value,
        cpf: statusCpf.value,
      });

      if (result.error) {
        showMsg('msg-status', result.error, 'error');
      } else {
        renderStatusResult(result.solicitacao);
        showMsg('msg-status', 'Andamento localizado com sucesso.', 'success');
      }
    } catch {
      showMsg('msg-status', 'Erro de conex\u00E3o. Tente novamente.', 'error');
    } finally {
      setLoading(btnStatusSubmit, false);
    }
  });

  syncLayoutState();
});
