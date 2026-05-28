document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = ['127.0.0.1', 'localhost'].includes(window.location.hostname) && window.location.port !== '3000'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : '';
  const currentUser = JSON.parse(localStorage.getItem('nit_user') || 'null');
  const adminSessionName = document.getElementById('admin-session-name');
  const adminSessionRole = document.getElementById('admin-session-role');

  const summaryPending = document.getElementById('summary-pending');
  const summaryApproved = document.getElementById('summary-approved');
  const summaryRejected = document.getElementById('summary-rejected');
  const summaryDisabled = document.getElementById('summary-disabled');
  const filterInput = document.getElementById('filter-input');
  const btnRefresh = document.getElementById('btn-refresh');
  const feedback = document.getElementById('feedback');
  const loadingState = document.getElementById('loading-state');
  const contentSections = document.getElementById('content-sections');
  const pendingEmpty = document.getElementById('pending-empty');
  const pendingTableWrapper = document.getElementById('pending-table-wrapper');
  const pendingRequestList = document.getElementById('pending-request-list');
  const activeEmpty = document.getElementById('active-empty');
  const activeTableWrapper = document.getElementById('active-table-wrapper');
  const activeUserList = document.getElementById('active-user-list');
  const credentialsModal = document.getElementById('credentials-modal');
  const credentialsModalEyebrow = document.getElementById('credentials-modal-eyebrow');
  const credentialsModalSubtitle = document.getElementById('credentials-modal-subtitle');
  const credentialsForm = document.getElementById('credentials-form');
  const credentialsUserId = document.getElementById('credentials-user-id');
  const credentialsUsername = document.getElementById('credentials-username');
  const credentialsPassword = document.getElementById('credentials-password');
  const credentialsFields = document.getElementById('credentials-fields');
  const credentialsFeedback = document.getElementById('credentials-feedback');
  const btnCloseCredentialsModal = document.getElementById('btn-close-credentials-modal');
  const btnCancelCredentialsModal = document.getElementById('btn-cancel-credentials-modal');
  const btnSaveCredentials = document.getElementById('btn-save-credentials');
  const btnModalApprove = document.getElementById('btn-modal-approve');
  const btnModalReject = document.getElementById('btn-modal-reject');
  const btnModalDeactivate = document.getElementById('btn-modal-deactivate');

  let pendingRequests = [];
  let activeUsers = [];
  let filterTerm = '';
  let selectedRecord = null;

  function redirectToLogin() {
    window.location.replace('/login.html');
  }

  function ensureAdminSession() {
    if (!currentUser) {
      redirectToLogin();
      return false;
    }

    if (!currentUser.adm) {
      window.location.replace('/bem-vindo.html');
      return false;
    }

    return true;
  }

  function hydrateAdminSession() {
    adminSessionName.textContent = currentUser?.nome || 'Administrador';
    adminSessionRole.textContent = currentUser?.oab ? 'Administrador advogado' : 'Administrador';
  }

  function getAdminHeaders(extraHeaders = {}) {
    return {
      'X-Admin-User-Id': String(currentUser.id),
      ...extraHeaders,
    };
  }

  function formatDate(value) {
    if (!value) return '-';

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `mb-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
      type === 'error'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-emerald-50 text-emerald-700'
    }`;
    feedback.classList.remove('hidden');
  }

  function hideFeedback() {
    feedback.classList.add('hidden');
    feedback.textContent = '';
  }

  function showCredentialsFeedback(message, type) {
    credentialsFeedback.textContent = message;
    credentialsFeedback.className = `rounded-2xl px-4 py-3 text-sm font-semibold ${
      type === 'error'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-emerald-50 text-emerald-700'
    }`;
    credentialsFeedback.classList.remove('hidden');
  }

  function hideCredentialsFeedback() {
    credentialsFeedback.classList.add('hidden');
    credentialsFeedback.textContent = '';
  }

  function setLoading(loading) {
    loadingState.classList.toggle('hidden', !loading);
    contentSections.classList.toggle('opacity-60', loading);
    btnRefresh.disabled = loading;
    btnRefresh.classList.toggle('opacity-70', loading);
    btnRefresh.classList.toggle('cursor-not-allowed', loading);
  }

  function matchesFilter(record) {
    const normalized = filterTerm.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [
      record.nome,
      record.email,
      record.oab,
      record.usuario,
      record.cpf,
      record.perfil,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  }

  function getProfileBadge(perfil) {
    if (perfil === 'advogado') {
      return '<span class="status-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-scale-balanced"></i>Advogado</span>';
    }

    return '<span class="status-badge bg-sky-100 text-sky-700"><i class="fa-solid fa-users"></i>Colaborador</span>';
  }

  function getDocumentLabel(record) {
    return record.oab ? `OAB ${record.oab}` : record.cpf || '-';
  }

  function updateRecordCredentials(list, updatedRecord) {
    return list.map((record) => (record.id === updatedRecord.id ? { ...record, usuario: updatedRecord.usuario } : record));
  }

  function openCredentialsModal(record) {
    selectedRecord = record;
    credentialsUserId.value = record.id;
    credentialsUsername.value = record.usuario || '';
    credentialsPassword.value = '';
    credentialsModalEyebrow.textContent = record.perfil === 'colaborador' ? 'Colaborador' : 'Advogado';
    credentialsModalSubtitle.textContent = `${record.nome} • ${record.email}`;
    credentialsFields.classList.toggle('hidden', record.perfil !== 'colaborador');
    btnSaveCredentials.classList.toggle('hidden', record.perfil !== 'colaborador');
    btnModalApprove.classList.toggle('hidden', record.status !== 'pendente');
    btnModalReject.classList.toggle('hidden', record.status !== 'pendente');
    btnModalDeactivate.classList.toggle('hidden', record.status !== 'aprovado');
    hideCredentialsFeedback();
    credentialsModal.classList.remove('hidden');
    credentialsModal.classList.add('flex');

    if (record.perfil === 'colaborador') {
      credentialsUsername.focus();
    } else if (record.status === 'pendente') {
      btnModalApprove.focus();
    } else if (record.status === 'aprovado') {
      btnModalDeactivate.focus();
    }
  }

  function closeCredentialsModal() {
    selectedRecord = null;
    credentialsForm.reset();
    hideCredentialsFeedback();
    credentialsModal.classList.add('hidden');
    credentialsModal.classList.remove('flex');
  }

  function renderPendingRequests() {
    const filtered = pendingRequests.filter(matchesFilter);
    pendingRequestList.innerHTML = '';

    pendingTableWrapper.classList.toggle('hidden', filtered.length === 0);
    pendingEmpty.classList.toggle('hidden', filtered.length > 0);

    if (filtered.length === 0) {
      const title = pendingRequests.length === 0
        ? 'Nenhuma solicitacao pendente'
        : 'Nenhum resultado encontrado';
      const description = pendingRequests.length === 0
        ? 'Quando novos cadastros chegarem, eles aparecerao aqui.'
        : 'Ajuste o termo de busca para localizar a solicitacao desejada.';

      pendingEmpty.querySelector('h4').textContent = title;
      pendingEmpty.querySelector('p').textContent = description;
      return;
    }

    filtered.forEach((request) => {
      const item = document.createElement('article');
      item.className = 'grid gap-4 px-5 py-5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] lg:items-start';

      item.innerHTML = `
        <div class="lg:min-h-[56px]">
          <p class="text-base font-extrabold text-nit-ink">${request.nome}</p>
          <p class="mt-1 text-sm text-slate-500">${request.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:items-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Perfil</p>
          <div class="mt-1 lg:mt-0">${getProfileBadge(request.perfil)}</div>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Documento</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${getDocumentLabel(request)}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Usuario</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${request.usuario || request.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Enviado em</p>
          <p class="mt-1 text-sm text-slate-600">${formatDate(request.criadoEm)}</p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row lg:min-h-[56px] lg:items-start lg:justify-end">
          <button
            type="button"
            class="btn-credentials rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            data-id="${request.id}"
          >
            . . .
          </button>
        </div>
      `;

      pendingRequestList.appendChild(item);
    });
  }

  function renderActiveUsers() {
    const filtered = activeUsers.filter(matchesFilter);
    activeUserList.innerHTML = '';

    activeTableWrapper.classList.toggle('hidden', filtered.length === 0);
    activeEmpty.classList.toggle('hidden', filtered.length > 0);

    if (filtered.length === 0) {
      const title = activeUsers.length === 0
        ? 'Nenhum usuario ativo encontrado'
        : 'Nenhum usuario ativo encontrado para a busca';
      const description = activeUsers.length === 0
        ? 'Usuarios aprovados aparecerao aqui para eventual desativacao.'
        : 'Ajuste o termo de busca para localizar o cadastro desejado.';

      activeEmpty.querySelector('h4').textContent = title;
      activeEmpty.querySelector('p').textContent = description;
      return;
    }

    filtered.forEach((user) => {
      const item = document.createElement('article');
      item.className = 'grid gap-4 px-5 py-5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] lg:items-start';

      item.innerHTML = `
        <div class="lg:min-h-[56px]">
          <p class="text-base font-extrabold text-nit-ink">${user.nome}</p>
          <p class="mt-1 text-sm text-slate-500">${user.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:items-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Perfil</p>
          <div class="mt-1 lg:mt-0">${getProfileBadge(user.perfil)}</div>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Documento</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${getDocumentLabel(user)}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Login</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${user.usuario || user.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Atualizado em</p>
          <p class="mt-1 text-sm text-slate-600">${formatDate(user.atualizadoEm)}</p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row lg:min-h-[56px] lg:items-start lg:justify-end">
          <button
            type="button"
            class="btn-credentials rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            data-id="${user.id}"
          >
            . . .
          </button>
        </div>
      `;

      activeUserList.appendChild(item);
    });
  }

  function renderAll() {
    renderPendingRequests();
    renderActiveUsers();
  }

  async function fetchDashboard() {
    setLoading(true);
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests`, {
        headers: getAdminHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel carregar o painel.');
      }

      pendingRequests = data.solicitacoes || [];
      activeUsers = data.usuariosAtivos || [];
      summaryPending.textContent = data.resumo?.pendentes ?? 0;
      summaryApproved.textContent = data.resumo?.ativos ?? 0;
      summaryRejected.textContent = data.resumo?.recusados ?? 0;
      summaryDisabled.textContent = data.resumo?.desativados ?? 0;
      renderAll();
    } catch (error) {
      pendingRequests = [];
      activeUsers = [];
      renderAll();
      showFeedback(error.message || 'Erro ao carregar o painel administrativo.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function reviewRequest(id, action) {
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests/${id}/${action}`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel atualizar a solicitacao.');
      }

      pendingRequests = pendingRequests.filter((request) => request.id !== id);
      summaryPending.textContent = Math.max(0, Number(summaryPending.textContent) - 1);

      if (action === 'approve') {
        summaryApproved.textContent = Number(summaryApproved.textContent) + 1;
        if (data.solicitacao) {
          activeUsers = [data.solicitacao, ...activeUsers];
        }
      } else {
        summaryRejected.textContent = Number(summaryRejected.textContent) + 1;
      }

      renderAll();
      showFeedback(data.message || 'Solicitacao atualizada com sucesso.', 'success');
    } catch (error) {
      showFeedback(error.message || 'Erro ao atualizar a solicitacao.', 'error');
    }
  }

  async function deactivateUser(id) {
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests/${id}/deactivate`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel desativar o cadastro.');
      }

      activeUsers = activeUsers.filter((user) => user.id !== id);
      summaryApproved.textContent = Math.max(0, Number(summaryApproved.textContent) - 1);
      summaryDisabled.textContent = Number(summaryDisabled.textContent) + 1;

      renderAll();
      showFeedback(data.message || 'Cadastro desativado com sucesso.', 'success');
    } catch (error) {
      showFeedback(error.message || 'Erro ao desativar o cadastro.', 'error');
    }
  }

  async function saveCollaboratorCredentials() {
    hideCredentialsFeedback();
    btnSaveCredentials.disabled = true;
    btnSaveCredentials.classList.add('opacity-70', 'cursor-not-allowed');

    try {
      const id = Number.parseInt(credentialsUserId.value, 10);
      const response = await fetch(`${API_BASE}/api/admin/access-requests/${id}/credentials`, {
        method: 'POST',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          usuario: credentialsUsername.value,
          senha: credentialsPassword.value,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel salvar as credenciais.');
      }

      pendingRequests = updateRecordCredentials(pendingRequests, data.solicitacao);
      activeUsers = updateRecordCredentials(activeUsers, data.solicitacao);
      renderAll();
      showFeedback(data.message || 'Credenciais definidas com sucesso.', 'success');
      closeCredentialsModal();
    } catch (error) {
      showCredentialsFeedback(error.message || 'Erro ao salvar credenciais.', 'error');
    } finally {
      btnSaveCredentials.disabled = false;
      btnSaveCredentials.classList.remove('opacity-70', 'cursor-not-allowed');
    }
  }

  filterInput.addEventListener('input', (event) => {
    filterTerm = event.target.value;
    renderAll();
  });

  btnRefresh.addEventListener('click', fetchDashboard);

  pendingRequestList.addEventListener('click', (event) => {
    const credentialsButton = event.target.closest('.btn-credentials');

    if (credentialsButton) {
      const record = pendingRequests.find((item) => item.id === Number.parseInt(credentialsButton.dataset.id, 10));
      if (record) openCredentialsModal(record);
    }
  });

  activeUserList.addEventListener('click', (event) => {
    const credentialsButton = event.target.closest('.btn-credentials');

    if (credentialsButton) {
      const record = activeUsers.find((item) => item.id === Number.parseInt(credentialsButton.dataset.id, 10));
      if (record) openCredentialsModal(record);
    }
  });

  credentialsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveCollaboratorCredentials();
  });

  btnCloseCredentialsModal.addEventListener('click', closeCredentialsModal);
  btnCancelCredentialsModal.addEventListener('click', closeCredentialsModal);
  btnModalApprove.addEventListener('click', async () => {
    if (!selectedRecord) return;
    await reviewRequest(selectedRecord.id, 'approve');
    closeCredentialsModal();
  });
  btnModalReject.addEventListener('click', async () => {
    if (!selectedRecord) return;
    await reviewRequest(selectedRecord.id, 'reject');
    closeCredentialsModal();
  });
  btnModalDeactivate.addEventListener('click', async () => {
    if (!selectedRecord) return;
    await deactivateUser(selectedRecord.id);
    closeCredentialsModal();
  });

  credentialsModal.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-backdrop')) {
      closeCredentialsModal();
    }
  });

  if (!ensureAdminSession()) return;

  hydrateAdminSession();
  fetchDashboard();
});
